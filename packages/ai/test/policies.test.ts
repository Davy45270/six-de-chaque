import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createGame, getLegalMoves, moveKey, projectPublicState, tileId, validateAction } from '@six-de-chaque/engine';
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
            expect(validateAction(pos.state, d.action)).toEqual({ ok: true });
            expect(d.seed).toMatch(/^[0-9a-f]{16}$/);
            expect(d.explanation.length).toBeGreaterThan(0);
        }), { numRuns: Number(process.env.FC_RUNS ?? 200) });
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
            if (d.action.type !== 'PLACE') throw new Error('pose attendue');
            const key = moveKey(pos.state, d.action.placements);
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
        if (d.action.type !== 'PLACE') throw new Error('pose attendue');
        expect(d.action.placements.map(p => p.tileId)).not.toContain(tileId(0, 4, 0));
    });
    it('exchange when no placement, pass when bag empty', () => {
        const noMove = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1], [1, 1], [1, 1, 1], [2, 2]], [[0, 0, 2]]], bagCount: 10 });
        // c1s1 et c2s2 ne touchent pas c0s0 ; c0s0 en double : aucune pose.
        expect(getLegalMoves(noMove, 'p1')).toEqual([]);
        const pos = positionOf(noMove);
        const d = decideNow(pos.view, pos.hand, 'p1', 'intermediate', 100, 0, pos.passLegal);
        expect(d.action.type).toBe('EXCHANGE');
        expect(validateAction(noMove, d.action)).toEqual({ ok: true });
        const empty = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0 });
        const pe = positionOf(empty);
        expect(decideNow(pe.view, pe.hand, 'p1', 'beginner', 100, 0, pe.passLegal).action.type).toBe('PASS');
        const dead = { ...empty, bag: [tileId(1, 1, 0)] };
        const pd = positionOf(dead);
        expect(pd.passLegal).toBe(true);
        expect(decideNow(pd.view, pd.hand, 'p1', 'beginner', 100, 0, pd.passLegal).action.type).toBe('PASS');
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
