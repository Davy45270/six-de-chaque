import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyAction, winners } from '../src/apply';
import { createGame } from '../src/create';
import { checkInvariants } from '../src/invariants';
import { submit } from '../src/session';
import { tileId } from '../src/tiles';
import type { GameAction, GameState } from '../src/types';
import { bot, human, stateFrom } from './fixtures';
import { configOf, playGame } from './play';

const act = (s: GameState, rest: Partial<GameAction> & Pick<GameAction, 'type'>): GameAction =>
    ({ actorId: s.players[s.currentPlayerIndex]?.id ?? '', expectedTurn: s.turnNumber, actionId: `x-${s.turnNumber}`, ...rest }) as GameAction;
const code = (t: ReturnType<typeof applyAction>) => (t.ok ? 'OK' : t.error.code);

describe('applyAction', () => {
    it('PLACE removes tiles from hand, adds them to board, scores, refills to six', () => {
        const s = stateFrom({ hands: [[[0, 0], [0, 1], [0, 2], [3, 3], [4, 4], [5, 5, 0]], [[1, 1]]] });
        const hand = s.players[0]?.hand ?? [];
        const t = applyAction(s, act(s, { type: 'PLACE', placements: [{ tileId: hand[0] ?? '', x: 0, y: 0 }, { tileId: hand[1] ?? '', x: 1, y: 0 }, { tileId: hand[2] ?? '', x: 2, y: 0 }] }));
        if (!t.ok) throw new Error(t.error.code);
        const p = t.state.players[0];
        expect(p?.hand).toHaveLength(6);
        expect(p?.hand.slice(0, 3)).toEqual(hand.slice(3));
        expect(p?.score).toBe(3);
        expect(Object.keys(t.state.board)).toEqual(['0:0', '1:0', '2:0']);
        expect(t.state.bag).toHaveLength(s.bag.length - 3);
        expect(t.state.currentPlayerIndex).toBe(1);
        expect(t.state.turnNumber).toBe(1);
        expect(t.event.score?.total).toBe(3);
    });
    it('phase goes from opening to playing after the first PLACE', () => {
        const g = createGame(configOf(2), 'phase');
        const hand = g.players[g.currentPlayerIndex]?.hand ?? [];
        const t = applyAction(g, act(g, { type: 'PLACE', placements: [{ tileId: hand[0] ?? '', x: 0, y: 0 }] }));
        expect(t.ok && t.state.phase).toBe('playing');
    });
    it('T13 exchanged tiles are not drawn back in the same exchange', () => {
        fc.assert(fc.property(fc.string(), fc.integer({ min: 1, max: 6 }), (seed, n) => {
            const g = { ...createGame(configOf(2), seed || 'x'), phase: 'playing' as const };
            const hand = g.players[g.currentPlayerIndex]?.hand ?? [];
            const given = hand.slice(0, n);
            const t = applyAction(g, act(g, { type: 'EXCHANGE', tileIds: given }));
            if (!t.ok) throw new Error(t.error.code);
            const after = t.state.players[g.currentPlayerIndex]?.hand ?? [];
            expect(after).toHaveLength(6);
            expect(after.filter(id => given.includes(id))).toEqual([]);
            expect(after.slice(6 - n)).toEqual(g.bag.slice(0, n));
            expect(t.state.bag).toHaveLength(g.bag.length);
            expect(t.event.score).toBeNull();
            expect(checkInvariants(t.state)).toEqual([]);
        }), { numRuns: 200 });
    });
    it('T14 exchange with fewer tiles in the bag than returned is rejected', () => {
        const s = stateFrom({ board: [[0, 0, 5, 5, 2]], hands: [[[0, 0], [0, 1], [0, 2]], [[1, 1]]], bagCount: 2 });
        expect(code(applyAction(s, act(s, { type: 'EXCHANGE', tileIds: s.players[0]?.hand ?? [] })))).toBe('BAG_TOO_SMALL');
        expect(code(applyAction(s, act(s, { type: 'EXCHANGE', tileIds: (s.players[0]?.hand ?? []).slice(0, 2) })))).toBe('OK');
        const h = s.players[0]?.hand ?? [];
        expect(code(applyAction(s, act(s, { type: 'EXCHANGE', tileIds: [h[0] ?? '', h[0] ?? ''] })))).toBe('DUPLICATE_TILE');
        expect(code(applyAction(s, act(s, { type: 'EXCHANGE', tileIds: [tileId(4, 4, 0)] })))).toBe('NOT_IN_HAND');
        expect(code(applyAction(s, act(s, { type: 'EXCHANGE', tileIds: [] })))).toBe('EMPTY');
    });
    it('exchange is refused in opening', () => {
        const g = createGame(configOf(2), 'ouverture');
        expect(code(applyAction(g, act(g, { type: 'EXCHANGE', tileIds: (g.players[g.currentPlayerIndex]?.hand ?? []).slice(0, 1) })))).toBe('EXCHANGE_IN_OPENING');
    });
    it('PASS is legal only when no placement is legal and the bag is empty', () => {
        // Plateau : c0s0 ; main c0s0 copie 1 seule → aucune pose possible.
        const blocked = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0 });
        expect(code(applyAction(blocked, act(blocked, { type: 'PASS' })))).toBe('OK');
        const withBag = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 1 });
        expect(code(applyAction(withBag, act(withBag, { type: 'PASS' })))).toBe('PASS_NOT_ALLOWED');
        const canPlace = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 1]], [[0, 0, 2]]], bagCount: 0 });
        expect(code(applyAction(canPlace, act(canPlace, { type: 'PASS' })))).toBe('PASS_NOT_ALLOWED');
        expect(code(applyAction(createGame(configOf(2), 'p'), act(createGame(configOf(2), 'p'), { type: 'PASS' })))).toBe('PASS_NOT_ALLOWED');
    });
    it('T15 last tile with empty bag gives +6 and ends the game', () => {
        const s = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[0, 1]], [[3, 3]]], bagCount: 0 });
        const t = applyAction(s, act(s, { type: 'PLACE', placements: [{ tileId: s.players[0]?.hand[0] ?? '', x: 1, y: 0 }] }));
        if (!t.ok) throw new Error(t.error.code);
        expect(t.state).toMatchObject({ phase: 'finished', endReason: 'out' });
        expect(t.event.finalBonus).toBe(6);
        expect(t.state.players[0]?.score).toBe(2 + 6);
        expect(code(applyAction(t.state, { ...act(t.state, { type: 'PASS' }), actorId: 'p1' }))).toBe('GAME_OVER');
    });
    it('T-block full pass round ends the game without bonus', () => {
        let s = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0 });
        const t1 = applyAction(s, act(s, { type: 'PASS' }));
        if (!t1.ok) throw new Error(t1.error.code);
        expect(t1.state).toMatchObject({ phase: 'playing', consecutivePasses: 1, currentPlayerIndex: 1 });
        s = t1.state;
        const t2 = applyAction(s, act(s, { type: 'PASS' }));
        if (!t2.ok) throw new Error(t2.error.code);
        expect(t2.state).toMatchObject({ phase: 'finished', endReason: 'blocked', consecutivePasses: 2 });
        expect(t2.event.finalBonus).toBe(0);
        expect(t2.state.players.map(p => p.score)).toEqual([0, 0]);
    });
    it('T16 rejected action leaves state, rng, scores and log unchanged', () => {
        const session = playGame(configOf(3), 'refus', { maxTurns: 5 });
        const before = structuredClone(session);
        const s = session.state;
        const bad: GameAction[] = [
            act(s, { type: 'PLACE', placements: [{ tileId: 't-999', x: 0, y: 0 }] }),
            { ...act(s, { type: 'PASS' }), actorId: 'personne' },
            act(s, { type: 'EXCHANGE', tileIds: ['t-999'] }),
            { ...act(s, { type: 'PASS' }), actionId: session.events[0]?.actionId ?? '' }
        ];
        for (const action of bad) {
            const { session: after, result } = submit(session, action);
            expect(result.ok).toBe(false);
            expect(after).toBe(session);
            expect(after).toStrictEqual(before);
            expect(applyAction(s, action).state).toBe(s);
        }
        expect(submit(session, { ...act(s, { type: 'PASS' }), actionId: session.events[0]?.actionId ?? '' }).result).toMatchObject({ ok: false, error: { code: 'DUPLICATE_ACTION' } });
    });
    it('T18 108 tiles are conserved after every action', () => {
        fc.assert(fc.property(fc.integer({ min: 2, max: 4 }), fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 1000 }), (n, seed, salt) => {
            let k = salt;
            playGame(configOf(n), seed, { limit: 8, pick: m => (m ? (k = (k * 31 + 7) % 9973) % m : 0), each: s => { expect(checkInvariants(s.state)).toEqual([]); } });
        }), { numRuns: Number(process.env.FC_RUNS ?? 100) });
    });
    it('winners returns every player tied at the top score', () => {
        const s = stateFrom({ hands: [[[0, 0]], [[1, 1]], [[2, 2]]] });
        const scored = { ...s, players: s.players.map((p, i) => ({ ...p, score: [7, 3, 7][i] ?? 0 })) };
        expect(winners(scored)).toEqual(['p1', 'p3']);
        expect(winners({ ...scored, players: scored.players.map((p, i) => ({ ...p, score: i })) })).toEqual(['p3']);
    });
    it('a game with an ai player can be created and played to the end', () => {
        const end = playGame({ players: [human('a'), bot('b', 'intermediate')] }, 'fin').state;
        expect(end.phase).toBe('finished');
        expect(end.endReason === 'out' || end.endReason === 'blocked').toBe(true);
    });
});
