import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createGame, getLegalMoves, moveKey, projectPublicState, tileId, validateAction } from '@six-de-chaque/engine';
import { getLegalMoves as aiMoves } from '@six-de-chaque/ai';
import type { Move } from '@six-de-chaque/ai';
import { decideNow, openFives } from '../src/policies';
import { stateFrom } from '../../engine/test/fixtures';
import { configOf } from '../../engine/test/play';
import { positionOf, positions } from './positions';

describe('ai policies', () => {
    it('every decision is a legal action', () => {
        fc.assert(fc.property(fc.string(), fc.integer({ min: 0, max: 60 }), fc.constantFrom('beginner' as const, 'intermediate' as const), (seed, turn, level) => {
            const all = positions(`ia-${seed}`, turn + 1);
            const pos = all[all.length - 1] ?? positionOf(createGame(configOf(2), `ia-${seed}`));
            const d = decideNow(pos.view, pos.hand, pos.playerId, level, 10_000, pos.state.turnNumber, pos.passLegal);
            expect(validateAction(pos.state, d.move)).toEqual({ ok: true });
            expect(d.seed).toMatch(/^[0-9a-f]{16}$/);
            expect(d.explanation.length).toBeGreaterThan(0);
        }), { numRuns: Number(process.env.AI_RUNS ?? 200) });
    }, 120_000);
    it('same view same decision', () => {
        for (const pos of positions('meme-vue', 12)) {
            for (const level of ['beginner', 'intermediate'] as const) {
                expect(decideNow(pos.view, pos.hand, pos.playerId, level, 10_000, pos.state.turnNumber))
                    .toEqual(decideNow(structuredClone(pos.view), [...pos.hand], pos.playerId, level, 10_000, pos.state.turnNumber));
            }
        }
    });
    it('intermediate picks the top score when no open five is created', () => {
        let checked = 0;
        for (const pos of positions('meilleur', 30)) {
            const moves = getLegalMoves(pos.state, pos.playerId);
            if (moves.length === 0 || moves.some(m => openFives(pos.view, m) > 0)) continue;
            const d = decideNow(pos.view, pos.hand, pos.playerId, 'intermediate', 10_000, pos.state.turnNumber);
            const best = Math.max(...moves.map(m => m.score));
            if (d.move.type !== 'PLACE') throw new Error('pose attendue');
            const key = moveKey(pos.state, d.move.placements);
            expect(moves.find(m => m.key === key)?.score).toBe(best);
            checked++;
        }
        expect(checked).toBeGreaterThan(5);
    });
    it('intermediate avoids leaving a line of five open when it costs little', () => {
        // Ligne c0s0..c0s3 ; main c0s4 et c1s5 seule utile ailleurs : poser c0s4 ouvre un cinq (5 - 4 = 1).
        const s = stateFrom({ board: [[0, 0, 0, 0], [1, 0, 0, 1], [2, 0, 0, 2], [3, 0, 0, 3], [0, 1, 1, 0]], hands: [[[0, 4], [2, 0]], [[5, 5]]] });
        const pos = positionOf(s);
        const d = decideNow(pos.view, pos.hand, pos.playerId, 'intermediate', 10_000, 0);
        if (d.move.type !== 'PLACE') throw new Error('pose attendue');
        expect(d.move.placements.map(p => p.tileId)).not.toContain(tileId(0, 4, 0));
    });
    it('exchange when no placement, pass when bag empty', () => {
        const noMove = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1], [1, 1], [1, 1, 1], [2, 2]], [[0, 0, 2]]], bagCount: 10 });
        // c1s1 et c2s2 ne touchent pas c0s0 ; c0s0 en double : aucune pose.
        expect(getLegalMoves(noMove, 'p1')).toEqual([]);
        const pos = positionOf(noMove);
        const d = decideNow(pos.view, pos.hand, 'p1', 'intermediate', 100, 0, pos.passLegal);
        expect(d.move.type).toBe('EXCHANGE');
        expect(validateAction(noMove, d.move)).toEqual({ ok: true });
        const empty = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0 });
        const pe = positionOf(empty);
        expect(decideNow(pe.view, pe.hand, 'p1', 'beginner', 100, 0, pe.passLegal).move.type).toBe('PASS');
        const dead = { ...empty, bag: [tileId(1, 1, 0)] };
        const pd = positionOf(dead);
        expect(pd.passLegal).toBe(true);
        expect(decideNow(pd.view, pd.hand, 'p1', 'beginner', 100, 0, pd.passLegal).move.type).toBe('PASS');
    });
    it('ai never reads other hands', () => {
        const pos = positions('mains', 5)[4];
        if (!pos) throw new Error('position');
        expect(pos.view.players.filter(p => p.id !== pos.playerId).every(p => p.hand === null)).toBe(true);
        expect(() => decideNow(pos.view, pos.hand, pos.playerId, 'intermediate', 10_000, pos.state.turnNumber)).not.toThrow();
        expect(JSON.stringify(projectPublicState(pos.state, pos.playerId))).not.toContain(pos.state.seed);
    });
    it('the node budget caps the evaluation', () => {
        const pos = positionOf(createGame(configOf(2), 'budget'));
        expect(decideNow(pos.view, pos.hand, pos.playerId, 'intermediate', 3, 0).evaluatedNodes).toBe(3);
    });
});

it('every decision returns move, explanation, evaluatedNodes and seed', () => {
    const opening = positionOf(createGame(configOf(2), 'decision'));
    const exchange = positionOf(stateFrom({ board: [[0, 0, 0, 0]], hands: [[[1, 1]], [[0, 1]]] }));
    const pass = positionOf(stateFrom({ board: [[0, 0, 0, 0]], hands: [[[1, 1]], [[0, 1]]], bagCount: 0 }));
    for (const [pos, type] of [[opening, 'PLACE'], [exchange, 'EXCHANGE'], [pass, 'PASS']] as const) {
        for (const level of ['beginner', 'intermediate', 'advanced', 'expert'] as const) {
            const decision = decideNow(pos.view, pos.hand, pos.playerId, level, 200, pos.state.turnNumber, pos.passLegal);
            expect(Object.keys(decision).sort()).toEqual(['evaluatedNodes', 'explanation', 'move', 'seed']);
            expect(decision.move.type).toBe(type);
            expect(decision.explanation).not.toBe('');
            expect(typeof decision.evaluatedNodes).toBe('number');
            expect(decision.seed).toMatch(/^[0-9a-f]{16}$/);
        }
    }
});

it('ai package exposes the legal move generator', () => {
    const { state, playerId } = positionOf(createGame(configOf(2), 'legal'));
    const moves: Move[] = aiMoves(state, playerId);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves).toEqual(getLegalMoves(state, playerId));
});

const weakHand = () => positionOf(stateFrom({ board: [[0, 0, 0, 0]],
    hands: [[[0, 1], [0, 1], [0, 1], [2, 2], [2, 2], [2, 2]], [[5, 5]]] }));

it('intermediate exchanges when no placement is useful', () => {
    const { state, view, hand, playerId } = weakHand();
    const moves = getLegalMoves(state, playerId);
    expect(Math.max(...moves.map(m => m.score))).toBe(2);
    const extra = tileId(0, 3, 0);
    const better = positionOf({ ...state, board: { ...state.board, '1:0': extra }, bag: state.bag.filter(id => id !== extra) });
    const diverseHand = [hand[0]!, tileId(2, 2, 0), tileId(3, 3, 0), tileId(4, 4, 0)];
    const blocked = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0 });
    const dead = positionOf({ ...blocked, bag: [tileId(1, 1, 0)] });
    expect(dead.passLegal).toBe(true);
    for (const level of ['intermediate', 'advanced', 'expert'] as const) {
        const d = decideNow(view, hand, playerId, level, 1000, state.turnNumber);
        expect(d.move.type).toBe('EXCHANGE');
        expect(validateAction(state, d.move)).toEqual({ ok: true });
        for (const bagCount of [0, 1]) {
            expect(decideNow({ ...view, bagCount }, hand, playerId, level, 1000, state.turnNumber).move.type).toBe('PLACE');
        }
        expect(decideNow(better.view, hand, playerId, level, 1000, state.turnNumber).move.type).toBe('PLACE');
        const diverse = { ...view, bagCount: view.bagCount + hand.length - diverseHand.length };
        expect(decideNow(diverse, diverseHand, playerId, level, 1000, state.turnNumber).move.type).toBe('PLACE');
        expect(decideNow({ ...view, phase: 'opening', board: {}, bagCount: view.bagCount + 1 }, hand, playerId, level, 1000, 0).move.type).toBe('PLACE');
        expect(decideNow(dead.view, dead.hand, dead.playerId, level, 1000, 0, dead.passLegal).move.type).toBe('PASS');
    }
});

it('beginner only exchanges without any placement', () => {
    const { view, hand, playerId, state } = weakHand();
    const place = decideNow(view, hand, playerId, 'beginner', 1000, state.turnNumber);
    expect(place.move.type).toBe('PLACE');
    const noPlacement = hand.filter(id => state.tilesById[id]?.color === 2);
    const exchange = decideNow(view, noPlacement, playerId, 'beginner', 1000, state.turnNumber);
    expect(exchange.move.type).toBe('EXCHANGE');
});

it('beginner picks among legal moves with a low score bias', () => {
    const state = stateFrom({ hands: [[[0, 0], [0, 1], [0, 2], [5, 5]], [[1, 1]]], bagCount: 0 });
    const { view, hand, playerId } = positionOf(state);
    const moves = getLegalMoves(state, playerId);
    const scores = new Map(moves.map(m => [m.key, m.score]));
    const best = Math.max(...scores.values());
    const baseline = moves.filter(m => m.score === best).length / moves.length;
    let top = 0;
    const trials = 1000;
    for (let turn = 0; turn < trials; turn++) {
        const { move } = decideNow({ ...view, turnNumber: turn }, hand, playerId, 'beginner', 1000, turn);
        expect(move.type).toBe('PLACE');
        if (move.type !== 'PLACE') throw new Error('pose attendue');
        const score = scores.get(moveKey(state, move.placements));
        expect(score).toBeDefined();
        if (score === best) top++;
    }
    expect(top / trials).toBeGreaterThan(baseline + 0.015);
    expect(top / trials).toBeLessThan(baseline + 0.18);
});
