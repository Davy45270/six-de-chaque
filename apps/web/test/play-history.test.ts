// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { projectPublicState } from '@six-de-chaque/engine';
import { configOf, playGame } from '../../../packages/engine/test/play';
import { initialUi } from '../src/game/controller';
import { describeEvent } from '../src/game/describe';
import { Play } from '../src/screens/Play';

vi.mock('../src/components', async importOriginal => ({
    ...await importOriginal<typeof import('../src/components')>(),
    Board: () => null
}));

it('during play every public move stays listed beyond the twelfth', () => {
    const config = configOf(2);
    const session = playGame(config, 'historique', { maxTurns: 14 });
    expect(session.events).toHaveLength(14);
    expect(session.state.phase).toBe('playing');

    const view = projectPublicState(session.state, null);
    const host = document.createElement('div');
    const root = createRoot(host);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
        act(() => {
            root.render(createElement(Play, {
                ui: initialUi(session, config, 'historique'), view, viewerHand: null,
                highContrast: false, colourBlind: false, announce: '', zoom: { n: 0, factor: 1 },
                dispatch: vi.fn(), onMenu: vi.fn()
            }));
        });
        const list = host.querySelector<HTMLOListElement>('[data-testid="history"]')!;
        const items = () => [...list.querySelectorAll('li')].map(item => [item.value, item.textContent]);
        const moves = session.events.slice().reverse().map(event =>
            [event.seq + 1, describeEvent(event, config, view.tilesById)]);
        const toggle = host.querySelector<HTMLButtonElement>('button[aria-controls]')!;
        expect(items()).toEqual(moves.slice(0, 12));
        expect(toggle.textContent).toBe("Tout l'historique (14 coups)");
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.getAttribute('aria-controls')).toBe(list.id);

        act(() => { toggle.click(); });
        expect(items()).toEqual(moves);
        expect(list.lastElementChild?.getAttribute('value')).toBe('1');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.textContent).toBe('Derniers coups seulement');

        act(() => { toggle.click(); });
        expect(items()).toEqual(moves.slice(0, 12));
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    } finally {
        act(() => { root.unmount(); });
        vi.unstubAllGlobals();
    }
});
