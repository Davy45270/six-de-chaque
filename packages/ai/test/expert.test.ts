import { expect, it } from 'vitest';
import { checkInvariants, createGame, seedToState, validateAction } from '@six-de-chaque/engine';
import { decide, decideNow } from '../src/policies';
import { sampleHiddenState } from '../src/expert';
import { configOf } from '../../engine/test/play';
import { positionOf, positions } from './positions';

const pos = () => positions('expert', 14).at(-1)!;

it('expert is reproducible for a given view', () => {
    const { view, hand, playerId, passLegal, state } = positions('expert', 3)[2]!;
    const result = decideNow(view, hand, playerId, 'expert', 512, state.turnNumber, passLegal);
    expect(result).toEqual(decideNow(structuredClone(view), [...hand], playerId, 'expert', 512, state.turnNumber, passLegal));
    const advanced = decideNow(view, hand, playerId, 'advanced', 512, state.turnNumber);
    expect(result.evaluatedNodes).toBeGreaterThan(advanced.evaluatedNodes);
    // Sur cette position, les réponses échantillonnées changent le premier choix du classement.
    expect(result.move).not.toEqual(advanced.move);
    expect(validateAction(state, result.move)).toEqual({ ok: true });
});

it('expert never exceeds its node budget', () => {
    const { view, hand, playerId, state } = pos();
    for (const budget of [0, 1, 2, 10, 64, 512]) {
        const search = decide(view, hand, playerId, 'expert', budget, state.turnNumber);
        let nodes = 0;
        let result = search.next();
        while (!result.done) { nodes += result.value; result = search.next(); }
        expect(result.value.evaluatedNodes).toBe(nodes);
        expect(nodes).toBeLessThanOrEqual(budget);
        if (budget > 0) expect(nodes).toBeGreaterThan(0);
        expect(validateAction(state, result.value.move)).toEqual({ ok: true });
    }
});

it('expert only samples tiles that are not visible', () => {
    const state = createGame(configOf(4), 'distribution');
    const { view, hand, playerId } = positionOf(state);
    const sampleView = { ...view, board: { '0:0': state.bag[0]! }, bagCount: view.bagCount - 1 };
    sampleView.phase = 'playing';
    const visible = new Set([...Object.values(sampleView.board), ...hand]);
    const layouts = new Set<string>();
    for (let i = 0; i < 8; i++) {
        const sampled = sampleHiddenState(sampleView, hand, playerId, seedToState(`sample-${i}`));
        expect(sampled.players.map(p => p.hand.length)).toEqual(view.players.map(p => p.handCount));
        expect(sampled.players.find(p => p.id === playerId)?.hand).toEqual(hand);
        expect(sampled.bag).toHaveLength(sampleView.bagCount);
        const hidden = [...sampled.players.filter(p => p.id !== playerId).flatMap(p => p.hand), ...sampled.bag];
        expect(hidden.some(id => visible.has(id))).toBe(false);
        expect(checkInvariants(sampled)).toEqual([]);
        layouts.add(hidden.join(','));
    }
    expect(layouts.size).toBe(8);
});
