// Règles de pose, sans contrôle du tour : partagées par la validation et le générateur de coups.
import { cellKey, isValidLine, MAX_LINE, STEP } from './lines';
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
    if (placements.some(p => Object.hasOwn(state.board, cellKey(p.x, p.y)))) return reject('OCCUPIED', 'Cette case est déjà occupée.');
    const first = placements[0] as Placement;
    let axis: Axis | null = null;
    if (placements.length > 1) {
        if (placements.every(p => p.y === first.y)) axis = 'h';
        else if (placements.every(p => p.x === first.x)) axis = 'v';
        else return reject('NOT_ALIGNED', 'Les tuiles doivent être sur une même ligne ou une même colonne.');
    }
    const added = new Map(placements.map(p => [cellKey(p.x, p.y), p.tileId]));
    const contact = { found: false };
    const at = (x: number, y: number): TileId | undefined => {
        const key = cellKey(x, y);
        const placed = added.get(key);
        if (placed !== undefined) return placed;
        const existing = state.board[key];
        if (existing !== undefined) contact.found = true;
        return existing;
    };
    if (axis) {
        const along = placements.map(p => (axis === 'h' ? p.x : p.y));
        const lo = Math.min(...along), hi = Math.max(...along);
        for (let v = lo; v <= Math.min(hi, lo + MAX_LINE); v++) {
            if ((axis === 'h' ? at(v, first.y) : at(first.x, v)) === undefined) return reject('GAP', 'La ligne posée a un trou.');
        }
        if (hi - lo >= MAX_LINE) return reject('LINE_TOO_LONG', 'Une ligne ne peut pas dépasser six tuiles.');
    }
    // Sur l’axe commun, le contrôle des trous établit que toutes les poses forment un seul segment.
    for (const ax of ['h', 'v'] as const) {
        const [dx, dy] = STEP[ax];
        for (const p of ax === axis ? [first] : placements) {
            const tiles: Tile[] = [state.tilesById[p.tileId] as Tile];
            for (const dir of [-1, 1]) {
                for (let x = p.x + dir * dx, y = p.y + dir * dy; ; x += dir * dx, y += dir * dy) {
                    const id = at(x, y);
                    if (id === undefined) break;
                    if (tiles.length === MAX_LINE) return reject('LINE_TOO_LONG', 'Une ligne ne peut pas dépasser six tuiles.');
                    tiles.push(state.tilesById[id] as Tile);
                }
            }
            if (tiles.length > 1 && !isValidLine(tiles)) return reject('INVALID_LINE', 'Une ligne doit partager une couleur ou un glyphe, sans doublon.');
        }
    }
    // Une partie commence sur un plateau vide. Ensuite, un segment lu doit établir le contact.
    if (state.phase !== 'opening' && !contact.found) {
        return reject('DISCONNECTED', 'Le coup doit toucher une tuile déjà posée.');
    }
    return OK;
}
