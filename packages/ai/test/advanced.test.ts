import { expect, it } from 'vitest';
import { applyAction, getLegalMoves, tileId } from '@six-de-chaque/engine';
import { scanLegalMoves } from '@six-de-chaque/engine/internal/move-scan';
import { decideNow } from '../src/policies';
import { stateFrom } from '../../engine/test/fixtures';
import { positionOf } from './positions';

function choice(state: ReturnType<typeof stateFrom>) {
    const { view, hand, playerId } = positionOf(state);
    const { move } = decideNow(view, hand, playerId, 'advanced', 2000, state.turnNumber);
    if (move.type !== 'PLACE') throw new Error('pose attendue');
    return move.placements;
}

it('advanced prefers a move that keeps a diverse hand', () => {
    const state = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[0, 1], [1, 0], [1, 0]], [[5, 5]]], bagCount: 0 });
    expect(new Set(getLegalMoves(state, 'p1').map(m => m.score))).toEqual(new Set([2]));
    expect(choice(state).map(p => p.tileId)).toEqual([tileId(1, 0, 0)]);
});

it('advanced prefers a move that keeps mobility', () => {
    const state = stateFrom({ board: [[0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 1, 0]], hands: [[[0, 2], [2, 0]], [[5, 5]]], bagCount: 0 });
    const mobile = { x: 0, y: 2, tileId: tileId(2, 0, 0) };
    const other = { x: -1, y: 0, tileId: tileId(0, 2, 0) };
    for (const [placement, cells] of [[mobile, 3], [other, 2]] as const) {
        const result = applyAction(state, { type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'mobility', placements: [placement] });
        if (!result.ok) throw new Error(result.error.code);
        expect(result.event.score?.total).toBe(3);
        const remaining = [...scanLegalMoves(result.state, 'p1')].filter(move => move !== null);
        expect(remaining).toHaveLength(cells); // Il reste une tuile, chaque pose correspond à une case.
    }
    expect(choice(state)).toEqual([mobile]);
});

it('advanced avoids opening a line of five', () => {
    const state = stateFrom({ board: [[0, 0, 0, 0], [1, 0, 0, 1], [2, 0, 0, 2], [3, 0, 0, 3], [0, 1, 1, 0]],
        hands: [[[0, 4], [2, 0]], [[5, 5]]], bagCount: 0 });
    expect(choice(state).map(p => p.tileId)).toEqual([tileId(2, 0, 0)]);
});
