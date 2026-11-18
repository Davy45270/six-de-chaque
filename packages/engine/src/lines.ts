// Lignes : compatibilité couleur/forme, segments maximaux du plateau, plus grand groupe d'une main.
import type { Tile, TileId } from './types';

export const MAX_LINE = 6;
export const cellKey = (x: number, y: number): string => `${x}:${y}`;
export function parseKey(key: string): { x: number; y: number } {
    const [x, y] = key.split(':').map(Number);
    return { x: x ?? Number.NaN, y: y ?? Number.NaN };
}

/** Ligne valide : 1 à 6 tuiles, (même couleur, formes uniques) ou (même forme, couleurs uniques). */
export function isValidLine(tiles: readonly Tile[]): boolean {
    if (tiles.length === 0 || tiles.length > MAX_LINE) return false;
    if (tiles.length === 1) return true;
    const colors = new Set(tiles.map(t => t.color));
    const shapes = new Set(tiles.map(t => t.shape));
    return (colors.size === 1 && shapes.size === tiles.length) || (shapes.size === 1 && colors.size === tiles.length);
}

/** Taille du plus grand groupe compatible d'une main ; les doublons exacts comptent une fois. */
export function largestCompatibleGroup(hand: readonly Tile[]): number {
    let best = 0;
    for (let v = 0; v < 6; v++) {
        best = Math.max(best, new Set(hand.filter(t => t.color === v).map(t => t.shape)).size,
            new Set(hand.filter(t => t.shape === v).map(t => t.color)).size);
    }
    return best;
}

export type Axis = 'h' | 'v';
export const STEP: Readonly<Record<Axis, readonly [number, number]>> = { h: [1, 0], v: [0, 1] };
/** Cases du segment maximal de `axis` qui passe par (x, y) dans `occupied` ; vide si la case est libre. */
export function segmentAt(occupied: (x: number, y: number) => boolean, x: number, y: number, axis: Axis): Array<{ x: number; y: number }> {
    if (!occupied(x, y)) return [];
    const [dx, dy] = STEP[axis];
    let sx = x, sy = y;
    while (occupied(sx - dx, sy - dy)) { sx -= dx; sy -= dy; }
    const cells: Array<{ x: number; y: number }> = [];
    for (let cx = sx, cy = sy; occupied(cx, cy); cx += dx, cy += dy) cells.push({ x: cx, y: cy });
    return cells;
}
export const boardLookup = (board: Readonly<Record<string, TileId>>, extra?: ReadonlyMap<string, TileId>) =>
    (x: number, y: number): TileId | undefined => extra?.get(cellKey(x, y)) ?? board[cellKey(x, y)];
