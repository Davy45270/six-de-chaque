// Les 108 tuiles : index i = (couleur × 6 + forme) × 3 + copie, identifiant « t-NNN ».
import type { Tile, TileId } from './types';

export const COLOR_COUNT = 6;
export const SHAPE_COUNT = 6;
export const COPIES = 3;
export const HAND_SIZE = 6;
export const TILE_COUNT = COLOR_COUNT * SHAPE_COUNT * COPIES;

export const tileId = (color: number, shape: number, copy: number): TileId =>
    `t-${String((color * SHAPE_COUNT + shape) * COPIES + copy).padStart(3, '0')}`;
const fromIndex = (i: number): Tile => ({ id: `t-${String(i).padStart(3, '0')}`, color: Math.floor(i / 18), shape: Math.floor(i / 3) % 6 });
export const ALL_TILES: readonly Tile[] = Object.freeze(Array.from({ length: TILE_COUNT }, (_, i) => Object.freeze(fromIndex(i))));
const BY_ID: ReadonlyMap<TileId, Tile> = new Map(ALL_TILES.map(t => [t.id, t]));
/** La tuile d'un identifiant connu ; lève sinon. */
export function tileOf(id: TileId): Tile {
    const tile = BY_ID.get(id);
    if (!tile) throw new Error(`tuile inconnue : ${id}`);
    return { ...tile };
}
export const isTileId = (id: string): boolean => BY_ID.has(id);
export function tilesRecord(): Record<TileId, Tile> {
    return Object.fromEntries(ALL_TILES.map(t => [t.id, { ...t }]));
}
