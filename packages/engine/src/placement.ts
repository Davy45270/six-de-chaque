// Règles de pose, sans contrôle du tour : partagées par la validation et le générateur de coups.
import { boardLookup, cellKey, isValidLine, MAX_LINE, segmentAt } from './lines';
import type { Axis } from './lines';
import type { GameState, Placement, Tile, TileId } from './types';
import { OK, reject } from './reject';
import type { Validation } from './reject';

/** Règles de pose seules (le tour est supposé bon) : utilisé par le générateur de coups. */
export function validatePlacements(state: GameState, hand: readonly TileId[], placements: readonly Placement[]): Validation {
    if (placements.length === 0) return reject('EMPTY', 'Pose au moins une tuile.');
    if (new Set(placements.map(p => p.tileId)).size !== placements.length) return reject('DUPLICATE_TILE', 'Une même tuile est posée deux fois.');
    if (new Set(placements.map(p => cellKey(p.x, p.y))).size !== placements.length) return reject('DUPLICATE_CELL', 'Deux tuiles sur la même case.');
    if (placements.some(p => !Number.isInteger(p.x) || !Number.isInteger(p.y))) return reject('NOT_INTEGER', 'Coordonnées non entières.');
    const limit = state.config.coordinateLimit;
    if (placements.some(p => Math.abs(p.x) > limit || Math.abs(p.y) > limit)) return reject('OUT_OF_BOUNDS', 'Case hors du plateau.');
    const inHand = new Set(hand);
    if (placements.some(p => !inHand.has(p.tileId))) return reject('NOT_IN_HAND', 'Cette tuile n’est pas dans ta main.');
    if (placements.some(p => state.board[cellKey(p.x, p.y)] !== undefined)) return reject('OCCUPIED', 'Cette case est déjà occupée.');
    const first = placements[0] as Placement;
    let axis: Axis | null = null;
    if (placements.length > 1) {
        if (placements.every(p => p.y === first.y)) axis = 'h';
        else if (placements.every(p => p.x === first.x)) axis = 'v';
        else return reject('NOT_ALIGNED', 'Les tuiles doivent être sur une même ligne ou une même colonne.');
    }
    const added = new Map(placements.map(p => [cellKey(p.x, p.y), p.tileId]));
    const at = boardLookup(state.board, added);
    const occupied = (x: number, y: number): boolean => at(x, y) !== undefined;
    if (axis) {
        const along = placements.map(p => (axis === 'h' ? p.x : p.y));
        const lo = Math.min(...along), hi = Math.max(...along);
        for (let v = lo; v <= hi; v++) {
            if (!(axis === 'h' ? occupied(v, first.y) : occupied(first.x, v))) return reject('GAP', 'La ligne posée a un trou.');
        }
    }
    const tile = (x: number, y: number): Tile => state.tilesById[at(x, y) as TileId] as Tile;
    const seen = new Set<string>();
    for (const p of placements) {
        for (const ax of ['h', 'v'] as const) {
            const cells = segmentAt(occupied, p.x, p.y, ax);
            const start = cells[0] as { x: number; y: number };
            const id = `${ax}:${start.x}:${start.y}`;
            if (cells.length < 2 || seen.has(id)) continue;
            seen.add(id);
            if (cells.length > MAX_LINE) return reject('LINE_TOO_LONG', 'Une ligne ne peut pas dépasser six tuiles.');
            if (!isValidLine(cells.map(c => tile(c.x, c.y)))) return reject('INVALID_LINE', 'Une ligne doit partager une couleur ou un glyphe, sans doublon.');
        }
    }
    if (Object.keys(state.board).length > 0) {
        const touches = placements.some(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.board[cellKey(p.x + (dx ?? 0), p.y + (dy ?? 0))] !== undefined));
        if (!touches) return reject('DISCONNECTED', 'Le coup doit toucher une tuile déjà posée.');
    }
    return OK;
}
