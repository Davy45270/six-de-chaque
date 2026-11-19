// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Camera } from '@six-de-chaque/renderer-pixi';
import { Replay } from '../src/screens/Replay';
import { configOf } from '../../../packages/engine/test/play';

const view = vi.hoisted(() => ({
    onCellTap: vi.fn(), render: vi.fn(), setAppearance: vi.fn(), destroy: vi.fn(),
    zoomBy: vi.fn(), getCamera: vi.fn(() => ({ x: 10, y: 20, zoom: 2 })), setCamera: vi.fn<(camera: Camera) => void>()
}));
vi.mock('@six-de-chaque/renderer-pixi', async importOriginal => ({
    ...await importOriginal<typeof import('@six-de-chaque/renderer-pixi')>(),
    createBoardView: () => Promise.resolve(view)
}));

it('in replay the board can be zoomed and panned with the keyboard and the zoom buttons', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
        act(() => {
            root.render(createElement(Replay, {
                config: configOf(2), seed: 'clavier-rejeu', events: [],
                highContrast: false, colourBlind: false, onBack: vi.fn(), onExport: vi.fn()
            }));
        });
        await act(async () => {
            await vi.waitFor(() => expect(view.onCellTap).toHaveBeenCalledOnce());
        });
        const board = host.querySelector<HTMLElement>('.board')!;
        expect(board.tabIndex).toBe(0);
        board.focus();
        expect(document.activeElement).toBe(board);

        for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', '+', '-']) {
            const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
            act(() => { board.dispatchEvent(event); });
            expect(event.defaultPrevented).toBe(true);
        }
        expect(view.setCamera.mock.calls.map(([camera]) => camera)).toEqual([
            { x: 34, y: 20, zoom: 2 },
            { x: 10, y: 44, zoom: 2 },
            { x: -14, y: 20, zoom: 2 },
            { x: 10, y: -4, zoom: 2 }
        ]);

        for (const label of ['Zoomer', 'Dézoomer']) {
            const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
            expect(button).not.toBeNull();
            act(() => { button?.click(); });
        }
        expect(view.zoomBy.mock.calls).toEqual([[1.2], [1 / 1.2], [1.2], [1 / 1.2]]);
        expect(board.dataset.ghost).toBe('0');
        expect(board.dataset.cursor).toBe('');
    } finally {
        act(() => { root.unmount(); });
        host.remove();
        vi.unstubAllGlobals();
    }
});
