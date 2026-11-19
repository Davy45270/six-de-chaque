// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameConfig, Session } from '@six-de-chaque/engine';
import { createGame, stateHash } from '@six-de-chaque/engine';
import { App } from '../src/App';
import * as storage from '../src/storage/db';
import type { BoardProps } from '../src/components';
import { checkedConfig, CURRENT_VERSION, SaveError } from '../src/storage/migrations';
import { exportGame, parseExport } from '../src/storage/transfer';
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
    const snapshot = { ...createGame(config, 'illisible'), turnNumber: -1 };
    const db = await openDb();
    try {
        await updateSave(db, 'games', games => {
            games.put({
                id: gameId, config: checkedConfig(config, CURRENT_VERSION), snapshot, version: CURRENT_VERSION,
                checksum: stateHash(snapshot), updatedTurn: snapshot.turnNumber
            });
        });
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

it('saveAll refuses to write a snapshot that breaks the contract', async () => {
    const config = configOf(2);
    const valid = playGame(config, 'illisible', { maxTurns: 1 });
    const invalid = { ...valid, state: { ...valid.state, turnNumber: -1 } };
    const db = await openDb();
    try {
        const before = await readSave(db);
        await expect(saveAll(db, gameId, invalid, config, { resumeOnReload: true })).rejects.toThrow(SaveError);
        expect(await readSave(db)).toBe(before);
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
    playTurn(session);
}

function playTurn(session: Session): void {
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

it('a failed initial save is shown on the game screen', async () => {
    const initialSave = vi.spyOn(storage, 'saveAll').mockRejectedValueOnce(new DOMException('Quota dépassé', 'QuotaExceededError'));
    const save = vi.spyOn(storage, 'saveTurn');
    const list = vi.spyOn(storage, 'listGames');
    const db = await openDb();
    try {
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
            await list.mock.results[0]?.value;
        });
        clickButton('Nouvelle partie');
        const secondPlayerKind = host.querySelectorAll('fieldset select')[1] as HTMLSelectElement;
        act(() => {
            secondPlayerKind.value = 'human';
            secondPlayerKind.dispatchEvent(new Event('change', { bubbles: true }));
        });
        clickButton('Commencer');
        await act(async () => {
            await vi.waitFor(() => expect(initialSave).toHaveBeenCalledOnce());
            await expect(initialSave.mock.results[0]?.value).rejects.toMatchObject({ name: 'QuotaExceededError' });
        });
        const [, id, initial] = initialSave.mock.calls[0]!;
        expect(await listGames(db)).toEqual([]);

        expect.soft(host.querySelector('main.handover [role="alert"]')?.textContent).toBe('La partie n’a pas pu être sauvegardée. Elle continue, mais un rechargement la perdrait.');
        const player = initial.state.players[initial.state.currentPlayerIndex];
        clickButton(`C’est moi, ${player?.name}`);
        expect(host.querySelector('main.play [role="alert"]')?.textContent).toBe('La partie n’a pas pu être sauvegardée. Elle continue, mais un rechargement la perdrait.');

        playTurn(initial);
        await act(async () => {
            await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
            await expect(save.mock.results[0]?.value).resolves.toBeUndefined();
        });
        const first = save.mock.calls[0]?.[2];
        expect(first?.events).toHaveLength(1);
        expect(await loadGame(db, id, 'resume')).toMatchObject({ consistent: true, session: first });
        expect(await getSetting(db, 'lastGameId')).toBe(id);
        expect(host.querySelector('main.handover')).not.toBeNull();
        expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
        db.close();
    }
});

it('a save whose updatedTurn field is wrong can still be resumed and played', async () => {
    const config = { players: configOf(2).players.map(p => ({ ...p, type: 'human' as const })) };
    const first = playGame(config, 'tour-altéré', { maxTurns: 1 });
    const db = await openDb();
    try {
        await saveAll(db, gameId, first, config);
        await updateSave(db, 'games', games => {
            const read = games.get(gameId);
            read.onsuccess = () => { games.put({ ...read.result, updatedTurn: 99 }); };
        });
        await setSetting(db, 'lastGameId', gameId);
        await resumeSavedGame();
        expect(await listGames(db)).toEqual([{ id: gameId, updatedTurn: 99, finished: false }]);

        const save = vi.spyOn(storage, 'saveTurn');
        playNextTurn(first);
        await act(async () => {
            await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
            await expect(save.mock.results[0]?.value).resolves.toBeUndefined();
        });
        const second = save.mock.calls[0]?.[2];
        expect(second?.events).toHaveLength(2);
        expect(await loadGame(db, gameId, 'resume')).toMatchObject({ consistent: true, session: second });
        expect(await listGames(db)).toEqual([{ id: gameId, updatedTurn: 2, finished: false }]);
        expect(host.querySelector('main.home')).toBeNull();
    } finally {
        db.close();
    }
});

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

function gameAtLastTurn(): { config: GameConfig; beforeEnd: Session; finished: Session } {
    const config: GameConfig = { players: [
        { id: 'alice', name: 'Alice', type: 'human' },
        { id: 'bob', name: 'Bob', type: 'human' }
    ] };
    let beforeEnd: Session | undefined;
    const finished = playGame(config, 'fin', { each: session => {
        if (session.state.phase !== 'finished') beforeEnd = session;
    } });
    if (!beforeEnd || finished.state.phase !== 'finished') throw new Error('Partie à un coup de la fin attendue');
    return { config, beforeEnd, finished };
}

it('after a game ends and the app reloads, no resumption is offered', async () => {
    const { config, beforeEnd, finished } = gameAtLastTurn();
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
        playNextTurn(beforeEnd);
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

it('after a failed save the export contains the finished game shown', async () => {
    const { config, beforeEnd, finished } = gameAtLastTurn();
    const db = await openDb();
    try {
        await saveAll(db, gameId, beforeEnd, config);
        await setSetting(db, 'lastGameId', gameId);
        await resumeSavedGame();

        const save = vi.spyOn(storage, 'saveTurn').mockRejectedValueOnce(new Error('Écriture impossible'));
        playNextTurn(beforeEnd);
        await act(async () => {
            await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
            await Promise.allSettled([save.mock.results[0]?.value]);
        });
        expect(host.querySelector('h1')?.textContent).toBe('Partie terminée');
        expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le dernier tour n’a pas pu être sauvegardé.');
        expect((await loadGame(db, gameId)).session).toEqual(beforeEnd);

        const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:partie');
        const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        clickButton('Exporter la partie');
        await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
        const blob = objectUrl.mock.calls[0]?.[0];
        if (!(blob instanceof Blob)) throw new Error('Fichier exporté attendu');
        const parsed = parseExport(await blob.text());
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.save.snapshot.phase).toBe('finished');
        expect(parsed.save.snapshot).toEqual(finished.state);
        expect(parsed.save.events).toEqual(save.mock.calls[0]?.[2].events);
    } finally {
        db.close();
    }
});

it.each([
    { name: 'an empty seed parameter starts a game with a random seed', query: '?seed=' },
    { name: 'a whitespace-only seed parameter starts a game with a random seed', query: '?seed=%20%20' }
])('$name', async ({ query }) => {
    const originalUrl = location.href;
    const randomSeed = '00000000-0000-4000-8000-000000000002';
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
        .mockReturnValueOnce(randomSeed);
    const save = vi.spyOn(storage, 'saveAll');
    const list = vi.spyOn(storage, 'listGames');
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
        event.preventDefault();
        errors.push(event.error);
    };
    window.addEventListener('error', onError);
    try {
        history.replaceState(null, '', query);
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
            await list.mock.results[0]?.value;
        });
        clickButton('Nouvelle partie');
        clickButton('Commencer');
        expect(errors).toEqual([]);
        await act(async () => {
            await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
            await save.mock.results[0]?.value;
        });
        expect(save.mock.calls[0]?.[2].state.seed).toBe(randomSeed);
        expect(randomUUID).toHaveBeenCalledTimes(2);
    } finally {
        history.replaceState(null, '', originalUrl);
        window.removeEventListener('error', onError);
    }
});

it('a failed new-game save keeps offering the previous saved game', async () => {
    const db = await openDb();
    const config = configOf(2);
    const previous = playGame(config, 'partie-précédente', { maxTurns: 1 });
    try {
        await saveAll(db, gameId, previous, config);
        await setSetting(db, 'lastGameId', gameId);
        const initialSave = vi.spyOn(storage, 'saveAll').mockRejectedValueOnce(new DOMException('Quota dépassé', 'QuotaExceededError'));
        const load = vi.spyOn(storage, 'loadGame');
        const list = vi.spyOn(storage, 'listGames');
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
            await load.mock.results[0]?.value;
        });
        expect(host.textContent).toContain('Reprendre la partie');
        clickButton('Nouvelle partie');
        clickButton('Commencer');
        await act(async () => {
            await vi.waitFor(() => expect(initialSave).toHaveBeenCalledOnce());
            await expect(initialSave.mock.results[0]?.value).rejects.toMatchObject({ name: 'QuotaExceededError' });
            await getSetting(db, 'lastGameId');
        });

        act(() => { root.unmount(); });
        root = createRoot(host);
        mount();
        await act(async () => {
            await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
            await list.mock.results[1]?.value;
            await load.mock.results[1]?.value;
        });
        expect(host.textContent).toContain('Reprendre la partie');
        expect(load).toHaveBeenLastCalledWith(expect.anything(), gameId, 'preview');
        expect(await getSetting(db, 'lastGameId')).toBe(gameId);
    } finally {
        db.close();
    }
});

it('the initial save alert names the game, not a turn', async () => {
    const initialSave = vi.spyOn(storage, 'saveAll').mockRejectedValueOnce(new DOMException('Quota dépassé', 'QuotaExceededError'));
    mount();
    clickButton('Nouvelle partie');
    clickButton('Commencer');
    await act(async () => {
        await vi.waitFor(() => expect(initialSave).toHaveBeenCalledOnce());
        await expect(initialSave.mock.results[0]?.value).rejects.toMatchObject({ name: 'QuotaExceededError' });
    });

    expect(host.querySelector('[role="alert"]')?.textContent)
        .toBe('La partie n’a pas pu être sauvegardée. Elle continue, mais un rechargement la perdrait.');
});
