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

function clickButton(label: string): void {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === label);
    if (!button) throw new Error(`Bouton absent : ${label}`);
    act(() => { button.click(); });
}

it('resuming an inconsistent save never overwrites it with a diverging snapshot', async () => {
    const config = { players: [
        { id: 'alice', name: 'Alice', type: 'human' as const },
        { id: 'bob', name: 'Bob', type: 'human' as const }
    ] };
    const session = playGame(config, 'reprise', { maxTurns: 1 });
    const diverging = { ...session, state: { ...session.state, players: session.state.players.map(p => p.id === 'alice' ? { ...p, score: 99 } : p) } };
    const db = await openDb();
    try {
        await saveAll(db, gameId, diverging, config);
        await setSetting(db, 'lastGameId', gameId);
        expect((await loadGame(db, gameId)).consistent).toBe(false);
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
        expect(host.querySelector('h1')?.textContent).toBe('Partie terminée');
        await vi.waitFor(async () => {
            expect(await getSetting(db, 'lastGameId')).toBeUndefined();
        });
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
