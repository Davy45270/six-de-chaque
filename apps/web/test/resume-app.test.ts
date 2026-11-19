// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameConfig, Session } from '@six-de-chaque/engine';
import { createGame } from '@six-de-chaque/engine';
import { App } from '../src/App';
import * as storage from '../src/storage/db';
import type { BoardProps } from '../src/components';
import { exportGame } from '../src/storage/transfer';
import { configOf, nextAction, playGame } from '../../../packages/engine/test/play';

const { getSetting, listGames, loadGame, openDb, saveAll, setSetting } = storage;

const board = vi.hoisted(() => ({ onTap: undefined as BoardProps['onTap'] }));
vi.mock('../src/components', async importOriginal => ({
    ...await importOriginal<typeof import('../src/components')>(),
    Board: ({ onTap }: BoardProps) => {
        board.onTap = onTap;
        return null;
    }
}));

const gameId = 'partie-locale';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
    board.onTap = undefined;
    host = document.createElement('div');
    root = createRoot(host);
});

afterEach(() => {
    act(() => { root.unmount(); });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function mount(): void {
    act(() => { root.render(createElement(App)); });
}

it('an unreadable saved game is reported on the home screen, not silently dropped', async () => {
    const config = configOf(2);
    const session = { state: { ...createGame(config, 'illisible'), turnNumber: -1 }, events: [] };
    const db = await openDb();
    try {
        await saveAll(db, gameId, session, config);
        await setSetting(db, 'lastGameId', gameId);
        const load = vi.spyOn(storage, 'loadGame');
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalled());
            await expect(load.mock.results[0]?.value).rejects.toThrow();
        });
        expect(host.querySelector('[role="alert"]')?.textContent).toBe('La partie sauvegardée ne peut pas être relue. Elle est conservée.');
        expect(host.textContent).not.toContain('Reprendre la partie');
        expect(await listGames(db)).toEqual([{ id: gameId, updatedTurn: -1, finished: false }]);
    } finally {
        db.close();
    }
});

function updateSave(db: IDBDatabase, store: 'games' | 'events', update: (rows: IDBObjectStore) => void): Promise<void> {
    const tx = db.transaction(store, 'readwrite');
    update(tx.objectStore(store));
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => { resolve(); };
        tx.onabort = () => { reject(tx.error ?? new Error('Transaction annulée')); };
    });
}

function readSave(db: IDBDatabase): Promise<string> {
    return Promise.all((['games', 'events', 'settings'] as const).map(store => new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => { resolve(request.result); };
        request.onerror = () => { reject(request.error ?? new Error('Lecture impossible')); };
    }))).then(rows => JSON.stringify(rows));
}

function clickButton(label: string): void {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === label);
    if (!button) throw new Error(`Bouton absent : ${label}`);
    act(() => { button.click(); });
}

async function resumeSavedGame(): Promise<void> {
    const load = vi.spyOn(storage, 'loadGame');
    const waitForLoad = async (count: number) => {
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(count));
            await load.mock.results[count - 1]?.value;
        });
    };
    mount();
    await waitForLoad(1);
    clickButton('Reprendre la partie');
    await waitForLoad(2);
}

function playNextTurn(session: Session): void {
    const player = session.state.players[session.state.currentPlayerIndex];
    clickButton(`C’est moi, ${player?.name}`);
    const action = nextAction(session);
    if (action.type === 'PASS') {
        clickButton('Passer');
        return;
    }
    if (action.type !== 'PLACE') throw new Error('Pose ou passe attendue');
    for (const { tileId, x, y } of action.placements) {
        const tile = host.querySelector<HTMLButtonElement>(`button[data-tile="${tileId}"]`);
        if (!tile || !board.onTap) throw new Error('Galet et plateau attendus');
        act(() => { tile.click(); });
        act(() => { board.onTap?.(x, y); });
    }
    clickButton('Valider');
}

it('a turn written from a stale tab is refused and the saved journal stays intact', async () => {
    const config = { players: configOf(2).players.map(p => ({ ...p, type: 'human' as const })) };
    const seed = 'onglets';
    const initial = playGame(config, seed, { maxTurns: 0 });
    const db = await openDb();
    try {
        await saveAll(db, gameId, initial, config);
        await setSetting(db, 'lastGameId', gameId);
        await resumeSavedGame();

        const first = playGame(config, seed, { maxTurns: 1 });
        const second = playGame(config, seed, { maxTurns: 2 });
        await storage.saveTurn(db, gameId, first, config, initial.state);
        await storage.saveTurn(db, gameId, second, config, first.state);
        const before = await readSave(db);

        const save = vi.spyOn(storage, 'saveTurn');
        playNextTurn(initial);
        await act(async () => {
            await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
            await Promise.allSettled([save.mock.results[0]?.value]);
        });
        await expect(save.mock.results[0]?.value).rejects.toBeInstanceOf(storage.StaleGameError);
        expect.soft(await readSave(db) === before).toBe(true);
        expect.soft(await loadGame(db, gameId, 'resume')).toMatchObject({ consistent: true, session: second });
        expect(host.querySelector('[role="alert"]')?.textContent).toBe('Cette partie a été jouée dans un autre onglet ; rechargez pour reprendre.');
        expect(host.textContent).not.toContain('Reprendre la partie');
    } finally {
        db.close();
    }
});

it('a corrupted snapshot is rebuilt from an intact journal', async () => {
    const config = { players: [
        { id: 'alice', name: 'Alice', type: 'human' as const },
        { id: 'bob', name: 'Bob', type: 'human' as const }
    ] };
    const session = playGame(config, 'reprise', { maxTurns: 1 });
    const diverging = { ...session, state: { ...session.state, players: session.state.players.map(p => p.id === 'alice' ? { ...p, score: 99 } : p) } };
    const db = await openDb();
    try {
        await saveAll(db, gameId, session, config);
        await updateSave(db, 'games', games => {
            const read = games.get(gameId);
            read.onsuccess = () => { games.put({ ...read.result, snapshot: diverging.state }); };
        });
        await setSetting(db, 'lastGameId', gameId);
        expect((await loadGame(db, gameId)).consistent).toBe(false);
        const load = vi.spyOn(storage, 'loadGame');
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
            await load.mock.results[0]?.value;
        });
        expect(await loadGame(db, gameId)).toMatchObject({ session: diverging, consistent: false });
        clickButton('Reprendre la partie');
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
            await load.mock.results[1]?.value;
        });
        expect(await loadGame(db, gameId)).toMatchObject({ session, consistent: true });
        const player = session.state.players[session.state.currentPlayerIndex];
        clickButton(`C’est moi, ${player?.name}`);
        const action = nextAction(session);
        if (action.type !== 'PLACE') throw new Error('pose attendue');
        for (const { tileId, x, y } of action.placements) {
            const tile = host.querySelector<HTMLButtonElement>(`button[data-tile="${tileId}"]`);
            if (!tile || !board.onTap) throw new Error('Galet et plateau attendus');
            act(() => { tile.click(); });
            act(() => { board.onTap?.(x, y); });
        }
        clickButton('Valider');
        await vi.waitFor(async () => {
            const saved = await loadGame(db, gameId);
            expect(saved.session.state.turnNumber).toBe(session.state.turnNumber + 1);
            expect(saved.consistent).toBe(true);
        });
        await expect(exportGame(db, gameId)).resolves.toBeTypeOf('string');
    } finally {
        db.close();
    }
});

it.each([
    { name: 'a truncated journal never overwrites a newer valid snapshot', corrupt: false },
    { name: 'a truncated journal never replaces the last saved turn, even with a corrupted snapshot', corrupt: true }
])('$name', async ({ corrupt }) => {
    const config = configOf(2);
    const session = playGame(config, 'journal-tronqué', { maxTurns: 4 });
    const last = session.events.at(-1);
    if (!last) throw new Error('Journal vide');
    const db = await openDb();
    try {
        await saveAll(db, gameId, session, config);
        await setSetting(db, 'lastGameId', gameId);
        await updateSave(db, 'events', events => { events.delete([gameId, last.seq]); });
        if (corrupt) {
            const players = session.state.players.map((p, i) => i === 0 ? { ...p, score: p.score + 50 } : p);
            await updateSave(db, 'games', games => {
                const read = games.get(gameId);
                read.onsuccess = () => { games.put({ ...read.result, snapshot: { ...session.state, players } }); };
            });
        }
        const before = await readSave(db);
        const load = vi.spyOn(storage, 'loadGame');
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledWith(expect.anything(), gameId, 'preview'));
            await load.mock.results[0]?.value;
        });
        expect.soft(await readSave(db)).toBe(before);
        expect.soft(host.textContent).not.toContain('Reprendre la partie');
        expect.soft(host.querySelector('[role="alert"]')?.textContent ?? '').toContain('La sauvegarde est conservée.');
        const loaded = await loadGame(db, gameId, 'resume');
        expect.soft(loaded.consistent).toBe(false);
        expect(await readSave(db) === before).toBe(true);
    } finally {
        db.close();
    }
});

it('an incoherent save with a broken journal stays untouched and cannot be resumed', async () => {
    const config = configOf(2);
    const session = playGame(config, 'journal-rompu', { maxTurns: 1 });
    const broken = { ...session, events: session.events.map(e => ({ ...e, hash: '0000000000000000' })) };
    const db = await openDb();
    try {
        await saveAll(db, gameId, broken, config);
        await setSetting(db, 'lastGameId', gameId);
        const load = vi.spyOn(storage, 'loadGame');
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalled());
            await load.mock.results[0]?.value;
        });
        expect(host.textContent).not.toContain('Reprendre la partie');
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('journal');
        expect(await loadGame(db, gameId)).toMatchObject({ session: broken, consistent: false });
    } finally {
        db.close();
    }
});

it.each([
    { name: 'a validated turn is saved before it is shown', fails: false },
    { name: 'a failed turn write is reported and the next save includes the missing event', fails: true }
])('$name', async ({ fails }) => {
    const config: GameConfig = { players: [
        { id: 'alice', name: 'Alice', type: 'human' },
        { id: 'bob', name: 'Bob', type: 'human' }
    ] };
    const session = playGame(config, 'écriture-avant-affichage', { maxTurns: 0 });
    const action = nextAction(session);
    if (action.type !== 'PLACE') throw new Error('Pose attendue');
    const db = await openDb();
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    const saveTurn = storage.saveTurn;
    const save = vi.spyOn(storage, 'saveTurn').mockImplementationOnce(async (...args) => {
        await writeGate;
        if (fails) throw new Error('Écriture impossible');
        await saveTurn(...args);
    });
    const load = vi.spyOn(storage, 'loadGame');
    const waitForLoad = async (count: number) => {
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(count));
            await load.mock.results[count - 1]?.value;
        });
    };
    try {
        await saveAll(db, gameId, session, config);
        await setSetting(db, 'lastGameId', gameId);
        mount();
        await waitForLoad(1);
        clickButton('Reprendre la partie');
        const heading = (name: string | undefined) => `Passe l’appareil à ${name}`;
        const player = session.state.players[session.state.currentPlayerIndex];
        await waitForLoad(2);
        expect(host.querySelector('h1')?.textContent).toBe(heading(player?.name));
        clickButton(`C’est moi, ${player?.name}`);
        const place = (move: typeof action) => {
            for (const { tileId, x, y } of move.placements) {
                const tile = host.querySelector<HTMLButtonElement>(`button[data-tile="${tileId}"]`);
                if (!tile || !board.onTap) throw new Error('Galet et plateau attendus');
                act(() => { tile.click(); });
                act(() => { board.onTap?.(x, y); });
            }
            clickButton('Valider');
        };
        place(action);
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const next = session.state.players.find(p => p.id !== player?.id);
        expect.soft(host.querySelector('h1')?.textContent).not.toBe(heading(next?.name));
        expect.soft(host.querySelector('[data-testid="announce"]')?.textContent).toBe('');
        expect((await loadGame(db, gameId)).session.state.turnNumber).toBe(0);

        await act(async () => {
            releaseWrite();
            await Promise.allSettled([save.mock.results[0]?.value]);
        });
        expect(host.querySelector('h1')?.textContent).toBe(heading(next?.name));
        if (fails) {
            expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le dernier tour n’a pas pu être sauvegardé.');
            expect((await loadGame(db, gameId)).session.state.turnNumber).toBe(0);
            const unsaved = save.mock.calls[0]?.[2];
            if (!unsaved) throw new Error('Tour en mémoire attendu');
            const move = nextAction(unsaved);
            if (move.type !== 'PLACE') throw new Error('Pose attendue');
            clickButton(`C’est moi, ${next?.name}`);
            place(move);
            await act(async () => {
                await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
                await save.mock.results[1]?.value;
            });
            expect(host.querySelector('[role="alert"]')).toBeNull();
            expect(await loadGame(db, gameId)).toMatchObject({
                consistent: true, session: { state: { turnNumber: 2 }, events: save.mock.calls[1]?.[2].events }
            });
            return;
        }
        act(() => { root.unmount(); });
        root = createRoot(host);
        mount();
        await waitForLoad(3);
        clickButton('Reprendre la partie');
        await waitForLoad(4);
        expect(host.querySelector('h1')?.textContent).toBe(heading(next?.name));
        clickButton(`C’est moi, ${next?.name}`);
        expect(host.querySelectorAll('[data-testid="history"] li')).toHaveLength(1);
        expect((await loadGame(db, gameId)).session.state.turnNumber).toBe(1);
    } finally {
        releaseWrite();
        db.close();
    }
});

it('after a game ends and the app reloads, no resumption is offered', async () => {
    const config: GameConfig = { players: [
        { id: 'alice', name: 'Alice', type: 'human' },
        { id: 'bob', name: 'Bob', type: 'human' }
    ] };
    let beforeEnd: Session | undefined;
    const finished = playGame(config, 'fin', { each: session => {
        if (session.state.phase !== 'finished') beforeEnd = session;
    } });
    if (!beforeEnd || finished.state.phase !== 'finished') throw new Error('Partie à un coup de la fin attendue');
    const finalAction = nextAction(beforeEnd);
    const db = await openDb();
    try {
        await saveAll(db, gameId, beforeEnd, config);
        await setSetting(db, 'lastGameId', gameId);
        const list = vi.spyOn(storage, 'listGames');
        const load = vi.spyOn(storage, 'loadGame');

        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
            await load.mock.results[0]?.value;
        });
        clickButton('Reprendre la partie');
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
            await load.mock.results[1]?.value;
        });
        const player = beforeEnd.state.players[beforeEnd.state.currentPlayerIndex];
        clickButton(`C’est moi, ${player?.name}`);
        if (finalAction.type === 'PASS') clickButton('Passer');
        else if (finalAction.type === 'PLACE') {
            for (const { tileId, x, y } of finalAction.placements) {
                const tile = host.querySelector<HTMLButtonElement>(`button[data-tile="${tileId}"]`);
                if (!tile || !board.onTap) throw new Error('Galet et plateau attendus');
                act(() => { tile.click(); });
                act(() => { board.onTap?.(x, y); });
            }
            clickButton('Valider');
        }
        await act(async () => {
            await vi.waitFor(async () => {
                expect(await getSetting(db, 'lastGameId')).toBeUndefined();
            });
        });
        expect(host.querySelector('h1')?.textContent).toBe('Partie terminée');
        expect(await loadGame(db, gameId)).toMatchObject({ session: { state: finished.state }, consistent: true });

        act(() => { root.unmount(); });
        root = createRoot(host);
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
            await list.mock.results[1]?.value;
        });
        expect(host.querySelector('main.home')).not.toBeNull();
        expect(host.textContent).not.toContain('Reprendre la partie');
    } finally {
        db.close();
    }
});
