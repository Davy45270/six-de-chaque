// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { BoardView } from '@six-de-chaque/renderer-pixi';
import type { Tile, TileId } from '@six-de-chaque/engine';
import { Board } from '../src/components';

const view = vi.hoisted(() => ({
    onCellTap: vi.fn(), render: vi.fn(), setAppearance: vi.fn(), destroy: vi.fn(),
    zoomBy: vi.fn(), getCamera: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })), setCamera: vi.fn()
}));
vi.mock('@six-de-chaque/renderer-pixi', async importOriginal => ({
    ...await importOriginal<typeof import('@six-de-chaque/renderer-pixi')>(),
    createBoardView: () => Promise.resolve(view)
}));

it('rendering a board of 100 tiles or more never zooms on its own', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const board: Record<string, TileId> = {};
    const tiles: Record<TileId, Tile> = {};
    for (let i = 0; i < 120; i++) {
        const id: TileId = `t${i}`;
        board[`${i % 12}:${Math.floor(i / 12)}`] = id;
        tiles[id] = { id, color: i % 6, shape: Math.floor(i / 6) % 6 };
    }
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    const props = { board, ghost: [], cursor: null, tiles, highContrast: false, colourBlind: false, label: 'Plateau', keyboardCamera: true };
    try {
        act(() => { root.render(createElement(Board, props)); });
        await act(async () => {
            await vi.waitFor(() => expect(view.onCellTap).toHaveBeenCalledOnce());
        });
        expect(view.render).toHaveBeenCalled();
        // D'autres rendus (curseur, fantôme) ne doivent pas zoomer non plus.
        act(() => { root.render(createElement(Board, { ...props, cursor: { x: 1, y: 1 } })); });
        act(() => { root.render(createElement(Board, { ...props, cursor: { x: 2, y: 1 } })); });
        expect(view.render.mock.calls.length).toBeGreaterThanOrEqual(3);
        const [first] = view.render.mock.calls[0] as Parameters<BoardView['render']>;
        expect(Object.keys(first.board).length).toBeGreaterThanOrEqual(100);
        expect(view.zoomBy).not.toHaveBeenCalled();

        // Une commande explicite, elle, zoome une seule fois.
        act(() => { root.render(createElement(Board, { ...props, cursor: { x: 2, y: 1 }, zoom: { n: 1, factor: 1.2 } })); });
        expect(view.zoomBy.mock.calls).toEqual([[1.2]]);
    } finally {
        act(() => { root.unmount(); });
        host.remove();
        vi.unstubAllGlobals();
    }
});
