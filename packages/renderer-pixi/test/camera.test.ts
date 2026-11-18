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
