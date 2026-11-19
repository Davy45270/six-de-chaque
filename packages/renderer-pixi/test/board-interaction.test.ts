// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createBoardView } from '../src/board-view';
import { COLORS_HIGH_CONTRAST, contrastRatio } from '../src/palette';

interface Stroke { color: string; width: number; alpha?: number }

const pixi = vi.hoisted(() => ({
    background: { color: '' },
    addTile: vi.fn<(sprite: { alpha: number }) => void>(),
    stroke: vi.fn<(paint: Stroke) => void>()
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
    Container: class {
        addChild = pixi.addTile;
        removeChildren() { return []; }
    },
    Graphics: class {
        clear() {}
        circle() {}
        fill() {}
        roundRect() { return this; }
        stroke = pixi.stroke;
    },
    Sprite: class {
        position = { set: vi.fn() };
    },
    Texture: { from: () => ({ destroy: vi.fn() }) }
}));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function visibleColour(color: string, alpha: number, background: string): string {
    const channels = [1, 3, 5].map(i => {
        const ink = parseInt(color.slice(i, i + 2), 16);
        const base = parseInt(background.slice(i, i + 2), 16);
        return Math.round(ink * alpha + base * (1 - alpha)).toString(16).padStart(2, '0');
    });
    return '#' + channels.join('');
}

it('high contrast ghost tiles keep at least 3:1 contrast on the board and stay distinct from placed tiles', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), { highContrast: true });
    try {
        const placed = { id: 'posé', color: 3, shape: 0 };
        const tiles = Object.fromEntries(COLORS_HIGH_CONTRAST.map((_, color) => [String(color), { id: String(color), color, shape: 0 }]));
        const board = { board: { '0:0': placed.id } };
        view.render(board, [], null, { ...tiles, [placed.id]: placed });
        expect(pixi.stroke).not.toHaveBeenCalled();
        pixi.addTile.mockClear();

        const ghosts = Object.keys(tiles).map((tileId, x) => ({ tileId, x: x + 1, y: 0 }));
        view.render(board, ghosts, null, { ...tiles, [placed.id]: placed });
        expect(pixi.addTile).toHaveBeenCalledTimes(1 + ghosts.length);
        expect(pixi.stroke).toHaveBeenCalledTimes(ghosts.length);
        const background = pixi.background.color;
        for (const [i, color] of COLORS_HIGH_CONTRAST.entries()) {
            const alpha = pixi.addTile.mock.calls[i + 1]![0].alpha;
            const ratio = contrastRatio(visibleColour(color, alpha, background), background);
            expect.soft(ratio, color).toBeGreaterThanOrEqual(3);
            const outline = pixi.stroke.mock.calls[i]![0];
            expect.soft(outline.alpha).toBe(1);
            expect.soft(contrastRatio(visibleColour(outline.color, outline.alpha ?? 1, background), background)).toBeGreaterThanOrEqual(3);
        }
    } finally {
        view.destroy();
    }
});

it('a two-finger contact never taps a cell', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        vi.spyOn(view.canvas, 'setPointerCapture').mockImplementation(() => {});
        const tap = vi.fn();
        view.onCellTap(tap);
        const pointer = (type: string, pointerId: number) => {
            view.canvas.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX: 120 + pointerId * 20, clientY: 120 }));
        };

        for (const end of ['pointerup', 'pointercancel']) {
            pointer('pointerdown', 1);
            pointer('pointerdown', 2);
            pointer(end, 1);
            expect(tap).not.toHaveBeenCalled();
            pointer('pointerup', 2);
            expect(tap).not.toHaveBeenCalled();
        }

        pointer('pointerdown', 1);
        pointer('pointerup', 1);
        expect(tap).toHaveBeenCalledOnce();
    } finally {
        view.destroy();
    }
});
