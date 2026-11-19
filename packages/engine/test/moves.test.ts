import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { findAnyLegalPlacement, getLegalMoves } from '../src/moves';
import { validateAction } from '../src/validate';
import { calculateScore } from '../src/score';
import type { GameState } from '../src/types';
import { stateFrom } from './fixtures';
import { bruteForceMoves } from './oracle';
import { configOf, playGame } from './play';

const place = (s: GameState, placements: Array<{ tileId: string; x: number; y: number }>) =>
    validateAction(s, { type: 'PLACE', actorId: s.players[s.currentPlayerIndex]?.id ?? '', expectedTurn: s.turnNumber, actionId: 'm', placements });

const smallState = fc.tuple(
    fc.array(fc.tuple(fc.integer({ min: -2, max: 2 }), fc.integer({ min: -2, max: 2 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })), { minLength: 1, maxLength: 8 }),
    fc.array(fc.tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 })), { minLength: 1, maxLength: 4 })
).map(([cells, hand]) => {
    const board = [...new Map(cells.map(([x, y, c, s]) => [`${x}:${y}`, [x, y, c % 3, s % 3] as [number, number, number, number]])).values()];
    try { return stateFrom({ board, hands: [hand, [[5, 5, 2]]] }); } catch { return null; }
});

describe('getLegalMoves', () => {
    it('empty board: single tiles at (0,0) and compatible lines from (0,0)', () => {
        const s = stateFrom({ hands: [[[0, 0], [0, 1], [1, 1]], [[5, 5]]] });
        const moves = getLegalMoves(s, 'p1');
        const singles = moves.filter(m => m.placements.length === 1);
        expect(singles).toHaveLength(3);
        expect(singles.every(m => m.placements[0]?.x === 0 && m.placements[0].y === 0)).toBe(true);
        expect(moves.every(m => m.placements.some(p => p.x === 0 && p.y === 0))).toBe(true);
        // Paires compatibles (c0s0-c0s1, c0s1-c1s1) : l'une ou l'autre à l'origine, l'autre d'un côté ou de l'autre,
        // sur deux axes, soit 16 coups de deux tuiles ; aucun de trois.
        expect(moves.filter(m => m.placements.length === 2)).toHaveLength(16);
        expect(moves.filter(m => m.placements.length === 3)).toHaveLength(0);
        expect(moves.every(m => m.score === calculateScore(s.board, m.placements).total)).toBe(true);
    });
    it('T19 every generated move is valid and has no duplicate keys', () => {
        for (let i = 0; i < 6; i++) {
            playGame(configOf(2), `t19-${i}`, { limit: 4, pick: n => (i * 7) % Math.max(n, 1), each: ({ state }) => {
                if (state.phase === 'finished') return;
                const id = state.players[state.currentPlayerIndex]?.id ?? '';
                const moves = getLegalMoves(state, id);
                expect(new Set(moves.map(m => m.key)).size).toBe(moves.length);
                for (const m of moves) expect(place(state, m.placements)).toEqual({ ok: true });
            } });
        }
    });
    it('every move returned by getLegalMoves is accepted by validateAction, off turn and after the end included', () => {
        let currentMoves = 0;
        const finished = playGame(configOf(3), 'revue', { each: ({ state }) => {
            if (state.turnNumber > 4 && state.phase !== 'finished') return;
            for (const player of state.players) {
                const context = `${state.phase}, tour ${state.turnNumber}, joueur ${player.id}`;
                const moves = getLegalMoves(state, player.id);
                const canPlay = state.phase !== 'finished' && player.id === state.players[state.currentPlayerIndex]?.id;
                if (canPlay) currentMoves += moves.length;
                else expect.soft(moves.length, context).toBe(0);
                const refusal = moves.map(({ placements }) => validateAction(state, {
                    type: 'PLACE', actorId: player.id, expectedTurn: state.turnNumber, actionId: 'pose', placements
                })).find(result => !result.ok);
                expect.soft(refusal, context).toBeUndefined();
            }
        } });
        expect(finished.state.phase).toBe('finished');
        expect(currentMoves).toBeGreaterThan(0);
    });
    it('T19 exhaustive against brute force on small boards', () => {
        let compared = 0;
        fc.assert(fc.property(smallState, s => {
            if (!s) return;
            compared++;
            expect(new Set(getLegalMoves(s, 'p1').map(m => m.key))).toEqual(bruteForceMoves(s, 'p1'));
        }), { numRuns: 150 });
        expect(compared).toBeGreaterThan(100);
    }, 120_000);
    it('T19 exhaustive against brute force on positions of real games (hand cut to three tiles)', () => {
        let compared = 0;
        playGame(configOf(2), 'oracle-reel', { maxTurns: 8, each: ({ state }) => {
            if (state.phase === 'finished') return;
            const i = state.currentPlayerIndex;
            const cut = { ...state, players: state.players.map((p, j) => (j === i ? { ...p, hand: p.hand.slice(0, 3) } : p)) };
            const id = state.players[i]?.id ?? '';
            expect(new Set(getLegalMoves(cut, id).map(m => m.key))).toEqual(bruteForceMoves(cut, id));
            compared++;
        } });
        expect(compared).toBe(8);
    });
    it('limit stops early', () => {
        const s = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [3, 0]], [[5, 5]]] });
        expect(getLegalMoves(s, 'p1').length).toBeGreaterThan(10);
        expect(getLegalMoves(s, 'p1', 3)).toHaveLength(3);
        expect(getLegalMoves(s, 'p1', 0)).toEqual([]);
        expect(getLegalMoves(s, 'personne')).toEqual([]);
        expect(findAnyLegalPlacement(s, 'p1')).not.toBeNull();
        expect(findAnyLegalPlacement(stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[5, 5]]] }), 'p1')).toBeNull();
    });
    it('generator never mutates state', () => {
        fc.assert(fc.property(smallState, s => {
            if (!s) return;
            const before = structuredClone(s);
            getLegalMoves(s, 'p1');
            expect(s).toEqual(before);
        }), { numRuns: 50 });
    });
});
