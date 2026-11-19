// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createBoardView } from '../src/board-view';
import { BOARD_BG, contrastRatio, INK } from '../src/palette';

interface Paint { color: string; alpha?: number }

const pixi = vi.hoisted(() => ({
    background: { color: '' },
    fill: vi.fn<(paint: Paint) => void>(),
    stroke: vi.fn<(paint: Paint) => void>()
}));

vi.mock('pixi.js', () => ({
    Application: class {
        canvas = document.createElement('canvas');
        screen = { width: 320, height: 240 };
        renderer = { background: pixi.background, on: vi.fn(), off: vi.fn() };
        stage = { addChild: vi.fn() };
        init({ background }: { background: string }) { pixi.background.color = background; }
        destroy() {}
    },
    Container: class { removeChildren() { return []; } },
    Graphics: class {
        clear() {}
        circle() {}
        roundRect() { return this; }
        fill = pixi.fill;
        stroke = pixi.stroke;
    },
    Texture: { from: () => ({ destroy: vi.fn() }) }
}));

afterEach(() => { vi.restoreAllMocks(); });

function visibleColour({ color, alpha = 1 }: Paint, background: string): string {
    const channels = [1, 3, 5].map(i => {
        const ink = parseInt(color.slice(i, i + 2), 16);
        const base = parseInt(background.slice(i, i + 2), 16);
        return Math.round(ink * alpha + base * (1 - alpha)).toString(16).padStart(2, '0');
    });
    return '#' + channels.join('');
}

it('high contrast board uses an ink grid and cursor on a plain background with at least 3:1 contrast', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const host = document.createElement('div');
    const render = async (highContrast: boolean) => {
        const view = await createBoardView(host, { highContrast });
        view.render({ board: {} }, [], { x: 0, y: 0 }, {});
        return view;
    };
    const checkHighContrast = () => {
        const background = pixi.background.color;
        expect.soft(background).toBe('#FFFFFF');
        for (const [label, paint] of [['grille', pixi.fill.mock.lastCall![0]], ['curseur', pixi.stroke.mock.lastCall![0]]] as const) {
            expect.soft(paint.color, label).toBe('#000000');
            expect.soft(contrastRatio(visibleColour(paint, background), background), label).toBeGreaterThanOrEqual(3);
        }
    };

    const view = await render(false);
    try {
        expect(pixi.background.color).toBe(BOARD_BG);
        await view.setAppearance({ highContrast: true });
        checkHighContrast();
        await view.setAppearance({ highContrast: false });
        expect(pixi.background.color).toBe(BOARD_BG);
        expect(pixi.fill.mock.lastCall?.[0]).toEqual({ color: INK, alpha: 0.18 });
        expect(pixi.stroke.mock.lastCall?.[0].color).toBe(INK);
    } finally {
        view.destroy();
    }

    const highContrastView = await render(true);
    try {
        checkHighContrast();
    } finally {
        highContrastView.destroy();
    }
});
