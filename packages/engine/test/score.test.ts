import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateScore } from '../src/score';
import { validateAction } from '../src/validate';
import { cellKey } from '../src/lines';
import type { Placement, TileId } from '../src/types';
import { stateFrom } from './fixtures';

const board = (cells: Array<[number, number]>): Record<string, TileId> => Object.fromEntries(cells.map(([x, y], i) => [cellKey(x, y), `t-${String(i).padStart(3, '0')}`]));
const at = (cells: Array<[number, number]>): Placement[] => cells.map(([x, y], i) => ({ tileId: `n-${i}`, x, y }));

describe('calculateScore', () => {
    it('T02 isolated first tile scores 1', () => { expect(calculateScore({}, at([[0, 0]]))).toEqual({ segments: [], base: 1, bonuses: 0, total: 1 }); });
    it('an empty move scores nothing', () => { expect(calculateScore({}, []).total).toBe(0); });
    it('T03 three tiles in a line score 3', () => { expect(calculateScore({}, at([[0, 0], [1, 0], [2, 0]])).total).toBe(3); });
    it('T04 completing a line of six scores 12', () => {
        const s = calculateScore(board([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]), at([[5, 0]]));
        expect(s).toMatchObject({ base: 6, bonuses: 6, total: 12 });
    });
    it('T05 one tile closing two lines of three scores 6', () => {
        const s = calculateScore(board([[0, 0], [1, 0], [2, -2], [2, -1]]), at([[2, 0]]));
        expect(s.total).toBe(6);
        expect(s.segments).toHaveLength(2);
    });
    it('multi-tile move counts main line once plus each crossing line >= 2', () => {
        expect(calculateScore(board([[0, 0], [1, 0]]), at([[0, 1], [1, 1]])).total).toBe(6);
    });
    it('two lines of six completed at once give two bonuses', () => {
        // Colonne x=0 de y=0..4 et ligne y=5 de x=1..5 : la tuile (0,5) complète les deux.
        const s = calculateScore(board([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]), at([[0, 5]]));
        expect(s).toMatchObject({ base: 12, bonuses: 12, total: 24 });
    });
    it('a single tile extending one line scores that line only', () => {
        expect(calculateScore(board([[0, 0]]), at([[0, 1]])).total).toBe(2);
    });
    it('segments are deduplicated', () => {
        const cell = fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }));
        let legal = 0;
        fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -2, max: 2 }), fc.integer({ min: -2, max: 2 }), cell), { maxLength: 5 }),
            fc.integer({ min: 1, max: 4 }), fc.boolean(), fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }), cell,
            (cells, n, horizontal, ox, oy, [c, s]) => {
                const unique = [...new Map(cells.map(([x, y, [cc, ss]]) => [`${x}:${y}`, [x, y, cc, ss, 0] as [number, number, number, number, number]])).values()];
                const moves = Array.from({ length: n }, (_, i) => [horizontal ? ox + i : ox, horizontal ? oy : oy + i, horizontal ? c : (c + i) % 6, horizontal ? (s + i) % 6 : s] as [number, number, number, number]);
                let state;
                try { state = stateFrom({ board: unique, hands: [moves.map(([, , cc, ss]) => [cc, ss, 1] as [number, number, number]), [[5, 5, 2]]] }); } catch { return; }
                const hand = state.players[0]?.hand ?? [];
                const placements = moves.map(([x, y], i) => ({ tileId: hand[i] ?? '', x, y }));
                if (!validateAction(state, { type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'a', placements }).ok) return;
                legal++;
                const keys = calculateScore(state.board, placements).segments.map(g => `${g.axis}:${g.startX}:${g.startY}:${g.endX}:${g.endY}`);
                expect(new Set(keys).size).toBe(keys.length);
            }), { numRuns: 300 });
        expect(legal).toBeGreaterThan(0);
    });
});
