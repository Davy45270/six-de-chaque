// Cas limites du score quand aucun segment (longueur ≥ 2) n'est formé :
// la base et le total doivent valoir 0 pour une pose vide et 1 pour une tuile isolée.
import { describe, expect, it } from 'vitest';
import { calculateScore } from '../src/score';
import { cellKey } from '../src/lines';
import type { Placement, TileId } from '../src/types';

const board = (cells: Array<[number, number]>): Record<string, TileId> => Object.fromEntries(cells.map(([x, y], i) => [cellKey(x, y), `t-${String(i).padStart(3, '0')}`]));
const at = (cells: Array<[number, number]>): Placement[] => cells.map(([x, y], i) => ({ tileId: `n-${i}`, x, y }));

describe('calculateScore sans segment', () => {
    it('une pose vide sur plateau vide vaut base 0 et total 0', () => {
        expect(calculateScore({}, [])).toEqual({ segments: [], base: 0, bonuses: 0, total: 0 });
    });

    it('une pose vide sur plateau occupé vaut base 0 et total 0', () => {
        expect(calculateScore(board([[0, 0], [1, 0]]), [])).toEqual({ segments: [], base: 0, bonuses: 0, total: 0 });
    });

    it('une tuile isolée sur plateau vide vaut base 1 et total 1', () => {
        expect(calculateScore({}, at([[3, -2]]))).toEqual({ segments: [], base: 1, bonuses: 0, total: 1 });
    });

    it('une tuile sans voisin orthogonal sur plateau occupé vaut base 1 et total 1', () => {
        // Seul un voisin en diagonale : aucune ligne n'est formée.
        expect(calculateScore(board([[0, 0]]), at([[1, 1]]))).toEqual({ segments: [], base: 1, bonuses: 0, total: 1 });
    });
});
