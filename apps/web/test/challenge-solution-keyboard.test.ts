// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Camera } from '@six-de-chaque/renderer-pixi';
import { Challenges } from '../src/screens/Challenges';

const view = vi.hoisted(() => ({
    onCellTap: vi.fn(), render: vi.fn(), setAppearance: vi.fn(), destroy: vi.fn(),
    zoomBy: vi.fn(), getCamera: vi.fn(() => ({ x: 10, y: 20, zoom: 2 })), setCamera: vi.fn<(camera: Camera) => void>()
}));
vi.mock('@six-de-chaque/renderer-pixi', async importOriginal => ({
    ...await importOriginal<typeof import('@six-de-chaque/renderer-pixi')>(),
    createBoardView: () => Promise.resolve(view)
}));
// Ouvre directement l'écran de fin d'un défi livré, d'où « Voir une solution » est accessible.
vi.mock('../src/game/challenge', async importOriginal => {
    const actual = await importOriginal<typeof import('../src/game/challenge')>();
    return { ...actual, startChallenge: (...args: Parameters<typeof actual.startChallenge>) => ({ ...actual.startChallenge(...args), status: 'lost' as const }) };
});

const buttonByText = (host: HTMLElement, text: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent.includes(text));

it('the solution of a challenge can be panned and zoomed with the keyboard and the zoom buttons', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
        act(() => {
            root.render(createElement(Challenges, {
                completed: new Set<string>(), highContrast: false, colourBlind: false, onComplete: vi.fn(), onHome: vi.fn()
            }));
        });
        const first = buttonByText(host, 'Défi ');
        expect(first, 'aucun défi livré dans la liste').toBeDefined();
        act(() => { first?.click(); });
        const show = buttonByText(host, 'Voir une solution');
        expect(show, 'bouton « Voir une solution » absent').toBeDefined();
        act(() => { show?.click(); });
        expect(host.querySelector('h1')?.textContent).toBe('Solution du défi');
        await act(async () => {
            await vi.waitFor(() => expect(view.onCellTap).toHaveBeenCalledOnce());
        });

        const board = host.querySelector<HTMLElement>('.board')!;
        expect(board.tabIndex, 'le plateau de la solution doit être focalisable').toBe(0);
        board.focus();
        expect(document.activeElement).toBe(board);

        for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', '+', '-']) {
            const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
            act(() => { board.dispatchEvent(event); });
            expect(event.defaultPrevented, `touche ${key} sans effet sur la vue`).toBe(true);
        }
        expect(view.setCamera.mock.calls.map(([camera]) => camera)).toEqual([
            { x: 34, y: 20, zoom: 2 },
            { x: 10, y: 44, zoom: 2 },
            { x: -14, y: 20, zoom: 2 },
            { x: 10, y: -4, zoom: 2 }
        ]);

        for (const label of ['Zoomer', 'Dézoomer']) {
            const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
            expect(button, `bouton ${label} absent`).not.toBeNull();
            act(() => { button?.click(); });
        }
        expect(view.zoomBy.mock.calls).toEqual([[1.2], [1 / 1.2], [1.2], [1 / 1.2]]);
    } finally {
        act(() => { root.unmount(); });
        host.remove();
        vi.unstubAllGlobals();
    }
});
