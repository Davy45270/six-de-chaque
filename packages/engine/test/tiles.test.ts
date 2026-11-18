import { describe, expect, it } from 'vitest';
import { ALL_TILES, tileId, tileOf } from '../src/tiles';

describe('tiles', () => {
    it('T01 108 unique ids, exactly 3 copies per colour-shape pair', () => {
        expect(ALL_TILES).toHaveLength(108);
        expect(new Set(ALL_TILES.map(t => t.id)).size).toBe(108);
        const pairs = new Map<string, number>();
        for (const t of ALL_TILES) pairs.set(`${t.color}:${t.shape}`, (pairs.get(`${t.color}:${t.shape}`) ?? 0) + 1);
        expect(pairs.size).toBe(36);
        expect([...pairs.values()].every(n => n === 3)).toBe(true);
    });
    it('tile ids follow the index formula', () => {
        expect(tileId(5, 5, 2)).toBe('t-107');
        expect(tileId(0, 0, 0)).toBe('t-000');
        expect(tileOf('t-040')).toEqual({ id: 't-040', color: 2, shape: 1 });
        ALL_TILES.forEach((t, i) => { expect(t.id).toBe(tileId(Math.floor(i / 18), Math.floor(i / 3) % 6, i % 3)); });
    });
});
