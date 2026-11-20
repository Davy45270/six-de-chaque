import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cellToScreen, fitBoard, panBy, screenToCell, zoomAt } from '../src/camera';

const CELL = 64;
const cam = fc.record({ x: fc.double({ min: -5000, max: 5000, noNaN: true }), y: fc.double({ min: -5000, max: 5000, noNaN: true }), zoom: fc.double({ min: 0.35, max: 2.5, noNaN: true }) });
describe('camera', () => {
    it('screenToCell inverts cell-to-screen for any camera', () => {
        fc.assert(fc.property(cam, fc.integer({ min: -200, max: 200 }), fc.integer({ min: -200, max: 200 }), (c, x, y) => {
            const { px, py } = cellToScreen(c, x + 0.5, y + 0.5, CELL);
            expect(screenToCell(c, px, py, CELL)).toEqual({ x, y });
        }), { numRuns: 300 });
    });
    it('zoomAt keeps the focal point fixed', () => {
        fc.assert(fc.property(cam, fc.double({ min: 0.5, max: 2, noNaN: true }), fc.double({ min: 0, max: 800, noNaN: true }), fc.double({ min: 0, max: 800, noNaN: true }), (c, f, px, py) => {
            const z = zoomAt(c, f, px, py);
            expect(px / z.zoom + z.x).toBeCloseTo(px / c.zoom + c.x, 6);
            expect(py / z.zoom + z.y).toBeCloseTo(py / c.zoom + c.y, 6);
        }), { numRuns: 200 });
    });
    it('zoom is clamped to [0.35, 2.5]', () => {
        expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, 0, 0).zoom).toBe(2.5);
        expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0.001, 0, 0).zoom).toBe(0.35);
    });
    it('fitBoard centres a single tile', () => {
        const c = fitBoard({ '0:0': 't-000' }, 400, 600, CELL);
        const { px, py } = cellToScreen(c, 0.5, 0.5, CELL);
        expect(px).toBeCloseTo(200, 6);
        expect(py).toBeCloseTo(300, 6);
        expect(screenToCell(fitBoard({}, 400, 600, CELL), 200, 300, CELL)).toEqual({ x: 0, y: 0 });
    });
    it('panBy moves the board with the finger', () => {
        const c = panBy({ x: 0, y: 0, zoom: 2 }, 20, -10);
        expect(cellToScreen(c, 0, 0, CELL)).toEqual({ px: 20, py: -10 });
    });
});

const wideBoard = { '-7:-6': 't-000', '9:-6': 't-001', '-7:7': 't-002', '9:7': 't-003' };

it('fitBoard keeps every tile of a 17 by 14 board inside a 366 by 364 view', () => {
    const camera = fitBoard(wideBoard, 366, 364, CELL);
    const topLeft = cellToScreen(camera, -9, -8, CELL);
    const bottomRight = cellToScreen(camera, 12, 10, CELL);
    expect(topLeft.px).toBeGreaterThanOrEqual(-1e-9);
    expect(topLeft.py).toBeGreaterThanOrEqual(-1e-9);
    expect(bottomRight.px).toBeLessThanOrEqual(366 + 1e-9);
    expect(bottomRight.py).toBeLessThanOrEqual(364 + 1e-9);
    expect(fitBoard(wideBoard, 1, 1, CELL).zoom).toBe(0.1);
});

it('from a fit below the minimum zoom the user can zoom in step by step up to a comfortable reading zoom of 1', () => {
    let camera = fitBoard(wideBoard, 366, 364, CELL);
    expect(camera.zoom).toBeLessThan(0.35);
    for (let step = 0; step < 30 && camera.zoom < 1; step++) {
        const next = zoomAt(camera, 1.2, 183, 182);
        expect(next.zoom).toBeGreaterThan(camera.zoom);
        expect(next.zoom).toBeCloseTo(camera.zoom * 1.2);
        camera = next;
    }
    expect(camera.zoom).toBeGreaterThanOrEqual(1);
});

it('after zooming in from a fit below the minimum, zooming out returns to the fit', () => {
    const fit = fitBoard(wideBoard, 366, 364, CELL);
    let camera = zoomAt(fit, 1.2, 183, 182, fit.zoom);
    expect(camera.zoom).toBeGreaterThan(fit.zoom);
    camera = zoomAt(camera, 1 / 1.2, 183, 182, fit.zoom);
    expect(camera.zoom).toBe(fit.zoom);
});

it('zooming out never goes below the fit of the current board', () => {
    const fit = fitBoard(wideBoard, 366, 364, CELL);
    let camera = fitBoard(wideBoard, 400, 400, CELL);
    for (const factor of [1.2, 1.2, 1 / 1.2, 1.2, 1 / 1.2, 1 / 1.2, 1 / 1.2, 1 / 1.2]) {
        camera = zoomAt(camera, factor, 183, 182, fit.zoom);
        expect(camera.zoom).toBeGreaterThanOrEqual(fit.zoom);
    }
    expect(camera.zoom).toBe(fit.zoom);
});

function expectBoardWithMarginsToFit(
    board: Parameters<typeof fitBoard>[0],
    width: number,
    height: number
): void {
    const camera = fitBoard(board, width, height, CELL);
    for (const key of Object.keys(board)) {
        const [x, y] = key.split(':').map(Number) as [number, number];
        const topLeft = cellToScreen(camera, x - 2, y - 2, CELL);
        const bottomRight = cellToScreen(camera, x + 3, y + 3, CELL);
        expect(topLeft.px).toBeGreaterThanOrEqual(-1e-9);
        expect(topLeft.py).toBeGreaterThanOrEqual(-1e-9);
        expect(bottomRight.px).toBeLessThanOrEqual(width + 1e-9);
        expect(bottomRight.py).toBeLessThanOrEqual(height + 1e-9);
    }
}

it('fitBoard keeps every tile of a 36-row board inside a 220 px high view', () => {
    expectBoardWithMarginsToFit({ '0:-17': 't-000', '0:18': 't-001' }, 362, 220);
});

it('fitBoard keeps every tile of a 58-column board inside a 362 px wide view', () => {
    expectBoardWithMarginsToFit({ '-29:0': 't-000', '28:0': 't-001' }, 362, 220);
});

it('a 113-cell extent including margins fits in 145 px and supports a zoom round trip', () => {
    const board = { '0:0': 't-000', '108:0': 't-001' };
    expectBoardWithMarginsToFit(board, 145, 145);
    const fit = fitBoard(board, 145, 145, CELL);
    const focus = 145 / 2;
    let camera = fit;
    for (let step = 0; step < 30 && camera.zoom < 1; step++) {
        camera = zoomAt(camera, 1.2, focus, focus, fit.zoom);
    }
    expect(camera.zoom).toBeGreaterThanOrEqual(1);
    for (let step = 0; step < 30; step++) {
        camera = zoomAt(camera, 1 / 1.2, focus, focus, fit.zoom);
    }
    expect(camera.zoom).toBe(fit.zoom);
    expect(camera.x).toBeCloseTo(fit.x);
    expect(camera.y).toBeCloseTo(fit.y);
});
