// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGame } from '@six-de-chaque/engine';
import { App } from '../src/App';
import * as storage from '../src/storage/db';
import { configOf } from '../../../packages/engine/test/play';

const { listGames, openDb, saveAll, setSetting } = storage;

const gameId = 'partie-locale';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
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
