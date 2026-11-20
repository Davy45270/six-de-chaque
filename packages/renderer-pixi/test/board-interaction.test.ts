// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createBoardView } from '../src/board-view';
import { ZOOM_MAX } from '../src/camera';
import type { Camera } from '../src/camera';
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

async function zoomAfterSinglePinch(initialZoom: number, startDistance: number, endDistance: number): Promise<number> {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        vi.spyOn(view.canvas, 'setPointerCapture').mockImplementation(() => {});
        view.setCamera({ x: 0, y: 0, zoom: initialZoom });
        const pointer = (type: string, pointerId: number, clientX: number) => {
            view.canvas.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX, clientY: 120 }));
        };

        pointer('pointerdown', 1, 120);
        pointer('pointerdown', 2, 120 + startDistance);
        pointer('pointermove', 2, 120 + endDistance);
        pointer('pointerup', 2, 120 + endDistance);
        pointer('pointerup', 1, 120);
        return view.getCamera().zoom;
    } finally {
        view.destroy();
    }
}

it('a pinch with a single move zooms by the distance ratio', async () => {
    expect.soft(await zoomAfterSinglePinch(1, 40, 80)).toBe(2);
    expect(await zoomAfterSinglePinch(1.5, 40, 80)).toBe(ZOOM_MAX);
});

it('a pinch inwards zooms out', async () => {
    expect(await zoomAfterSinglePinch(1, 80, 40)).toBe(0.5);
});

async function cameraAfterGesture(
    moves: Array<[id: number, x: number, y: number]>,
    zoom = 1
): Promise<Camera> {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        vi.spyOn(view.canvas, 'setPointerCapture').mockImplementation(() => {});
        view.setCamera({ x: 0, y: 0, zoom });
        const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
            view.canvas.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX, clientY }));
        };
        pointer('pointerdown', 1, 120, 120);
        pointer('pointerdown', 2, 160, 120);
        for (const move of moves) pointer('pointermove', ...move);
        return view.getCamera();
    } finally {
        view.destroy();
    }
}

it("a pinch keeps the world point under the fingers' midpoint", async () => {
    expect(await cameraAfterGesture([[2, 200, 120]])).toEqual({ x: 60, y: 60, zoom: 2 });
});

it('a two-finger drag at constant spread pans the board', async () => {
    // Les deux contacts se déplacent de 40 px, avec deux événements successifs.
    expect(await cameraAfterGesture([[2, 200, 120], [1, 160, 120]]))
        .toEqual({ x: -40, y: 0, zoom: 1 });
    // Un seul événement peut aussi préserver exactement l'écartement.
    expect(await cameraAfterGesture([[2, 120, 160]]))
        .toEqual({ x: 20, y: -20, zoom: 1 });
});

it('a pinch driven by the first finger zooms like one driven by the second', async () => {
    const first = await cameraAfterGesture([[1, 80, 120]]);
    const second = await cameraAfterGesture([[2, 200, 120]]);
    expect(first).toEqual({ ...second, x: second.x + 20 });
});

it('the first frame after resume keeps every tile on screen when the board excludes the origin', async () => {
    const { CELL_PX } = await import('../src/board-view');
    const { cellToScreen } = await import('../src/camera');
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        const tiles = { a: { id: 'a', color: 0, shape: 0 }, b: { id: 'b', color: 0, shape: 1 } };
        const cells = [{ x: 40, y: 40 }, { x: 41, y: 40 }];
        view.render({ board: { '40:40': 'a', '41:40': 'b' } }, [], { x: 0, y: 0 }, tiles);

        const camera = view.getCamera();
        for (const { x, y } of cells) {
            const { px, py } = cellToScreen(camera, x, y, CELL_PX);
            expect(px).toBeGreaterThanOrEqual(0);
            expect(py).toBeGreaterThanOrEqual(0);
            expect(px + CELL_PX * camera.zoom).toBeLessThanOrEqual(320);
            expect(py + CELL_PX * camera.zoom).toBeLessThanOrEqual(240);
        }
    } finally {
        view.destroy();
    }
});

it('a secondary mouse click never taps a cell', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        vi.spyOn(view.canvas, 'setPointerCapture').mockImplementation(() => {});
        const tap = vi.fn();
        view.onCellTap(tap);
        const pointer = (type: string, button: number) => {
            view.canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button, clientX: 120, clientY: 120 }));
        };

        for (const button of [1, 2]) {
            pointer('pointerdown', button);
            pointer('pointerup', button);
            expect.soft(tap, `bouton ${button}`).not.toHaveBeenCalled();
            tap.mockClear();
        }
        pointer('pointerdown', 0);
        pointer('pointerup', 2);
        expect.soft(tap).not.toHaveBeenCalled();
        tap.mockClear();

        pointer('pointerdown', 0);
        pointer('pointerup', 0);
        expect(tap).toHaveBeenCalledOnce();
    } finally {
        view.destroy();
    }
});

it('after a manual pan, a render with an unchanged cursor keeps the camera', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        vi.spyOn(view.canvas, 'setPointerCapture').mockImplementation(() => {});
        const board = { board: { '0:0': 'a' } };
        const tiles = { a: { id: 'a', color: 0, shape: 0 } };
        view.render(board, [], { x: 0, y: 0 }, tiles);
        const initial = view.getCamera();
        const drag = (type: string, clientX: number) => {
            view.canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientX, clientY: 120 }));
        };
        drag('pointerdown', 40);
        drag('pointermove', 300);
        drag('pointerup', 300);
        const panned = view.getCamera();
        expect(panned.x).toBeLessThan(initial.x);

        view.render(board, [], { x: 0, y: 0 }, tiles);
        expect(view.getCamera()).toEqual(panned);
        view.render(board, [], { x: 1, y: 0 }, tiles);
        expect(view.getCamera().x).toBeGreaterThan(panned.x);
    } finally {
        view.destroy();
    }
});
