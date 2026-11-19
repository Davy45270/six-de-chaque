// Caméra du plateau : (x, y) = point du monde (en pixels de case) au coin haut gauche de l'écran ; zoom borné.
import type { TileId } from '@six-de-chaque/engine';

export interface Camera { x: number; y: number; zoom: number }
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 2.5;
export const FIT_MIN = 0.1;
export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export function cellToScreen(cam: Camera, x: number, y: number, cellPx: number): { px: number; py: number } {
    return { px: (x * cellPx - cam.x) * cam.zoom, py: (y * cellPx - cam.y) * cam.zoom };
}
export function screenToCell(cam: Camera, px: number, py: number, cellPx: number): { x: number; y: number } {
    return { x: Math.floor((px / cam.zoom + cam.x) / cellPx), y: Math.floor((py / cam.zoom + cam.y) / cellPx) };
}
export function zoomAt(cam: Camera, factor: number, px: number, py: number): Camera {
    // Sous le minimum manuel, le cadrage courant sert de limite jusqu'au retour dans la plage normale.
    const target = cam.zoom * factor;
    const zoom = cam.zoom < ZOOM_MIN ? Math.min(ZOOM_MAX, Math.max(cam.zoom, target)) : clampZoom(target);
    if (zoom === cam.zoom) return cam;
    const wx = px / cam.zoom + cam.x, wy = py / cam.zoom + cam.y;
    return { zoom, x: wx - px / zoom, y: wy - py / zoom };
}
export function panBy(cam: Camera, dx: number, dy: number): Camera {
    return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}
/** Cadre tout le plateau (plus deux cases de marge) et le centre dans la vue. */
export function fitBoard(board: Readonly<Record<string, TileId>>, viewW: number, viewH: number, cellPx: number, extra: ReadonlyArray<{ x: number; y: number }> = []): Camera {
    const cells = [...Object.keys(board).map(k => k.split(':').map(Number) as [number, number]), ...extra.map(c => [c.x, c.y] as [number, number])];
    if (cells.length === 0) cells.push([0, 0]);
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 3;
    const zoom = Math.max(FIT_MIN, Math.min(viewW / ((x1 - x0) * cellPx), viewH / ((y1 - y0) * cellPx), 1.4));
    const cx = ((x0 + x1) / 2) * cellPx, cy = ((y0 + y1) / 2) * cellPx;
    return { zoom, x: cx - viewW / (2 * zoom), y: cy - viewH / (2 * zoom) };
}
