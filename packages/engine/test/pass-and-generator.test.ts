import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/apply';
import { createGame } from '../src/create';
import { cellKey } from '../src/lines';
import { getLegalMoves } from '../src/moves';
import { scanLegalMoves } from '../src/move-scan';
import { validateAction } from '../src/validate';
import type { GameAction, GameState } from '../src/types';
import { stateFrom } from './fixtures';
import { configOf, playGame } from './play';

describe('pass and exchange', () => {
    it('a pass and an exchange both score zero points', () => {
        // Le seul double d'une tuile du plateau ne se pose nulle part. Réserve vide : passer est permis ; réserve
        // pleine : échanger est permis.
        const board: Array<[number, number, number, number, number?]> = [[0, 0, 0, 0, 0]];
        const hands: Array<Array<[number, number, number?]>> = [[[0, 0, 1]], [[5, 5]]];
        const empty = stateFrom({ board, hands, bagCount: 0 });
        const full = stateFrom({ board, hands });
        const actorId = 'p1';
        const before = full.players[0]?.score;
        for (const [state, action] of [
            [empty, { type: 'PASS' as const, actorId, expectedTurn: empty.turnNumber, actionId: 'passe' }],
            [full, { type: 'EXCHANGE' as const, actorId, expectedTurn: full.turnNumber, actionId: 'échange', tileIds: [...(full.players[0]?.hand ?? [])] }]
        ] satisfies Array<[GameState, GameAction]>) {
            const result = applyAction(state, action);
            if (!result.ok) throw new Error(`${action.type} refusé : ${result.error.detail}`);
            expect(result.event.score?.total ?? 0, action.type).toBe(0);
            expect(result.event.finalBonus, action.type).toBe(0);
            expect(result.state.players.find(p => p.id === actorId)?.score, action.type).toBe(before);
        }
    });
});

/** Cases vides adjacentes au plateau (l'origine seule sur un plateau vide). */
function frontierCells(state: GameState): number {
    const keys = Object.keys(state.board);
    if (keys.length === 0) return 1;
    const cells = new Set<string>();
    for (const key of keys) {
        const [x, y] = key.split(':').map(Number) as [number, number];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (state.board[cellKey(x + dx!, y + dy!)] === undefined) cells.add(cellKey(x + dx!, y + dy!));
    }
    return cells.size;
}

describe('move generation', () => {
    it('move generation is bounded by frontier cells, hand subsets and candidate placements', () => {
        let positions = 0;
        for (const seed of ['borne-1', 'borne-2', 'borne-3']) {
            let turn = 0;
            playGame(configOf(2), seed, {
                limit: 4, pick: n => (turn * 7) % Math.max(n, 1), maxTurns: 60,
                each: session => {
                    turn++;
                    const s = session.state;
                    if (s.phase === 'finished') return;
                    const player = s.players[s.currentPlayerIndex];
                    if (!player) throw new Error('joueur courant');
                    const subsets = 2 ** player.hand.length - 1;
                    const bound = frontierCells(s) * subsets * 6;
                    const moves = getLegalMoves(s, player.id).length;
                    expect(moves, `${seed}, tour ${s.turnNumber} : ${moves} coups pour ${frontierCells(s)} cases frontière`).toBeLessThanOrEqual(bound);
                    // Travail du générateur : chaque suspension de scanLegalMoves est une pose candidate essayée ou une
                    // case sans tuile compatible ; leur nombre tient sous la même borne.
                    const work = [...scanLegalMoves(s, player.id)].length;
                    expect(work, `${seed}, tour ${s.turnNumber} : ${work} poses candidates`).toBeLessThanOrEqual(bound);
                    positions++;
                }
            });
        }
        expect(positions).toBeGreaterThan(100);
    });
});

describe('coordinate limit', () => {
    it('a configured coordinate limit is enforced by validation and by the generator', () => {
        const created = createGame({ ...configOf(2), rules: { coordinateLimit: 3 } }, 'limite-3');
        expect(created.config.coordinateLimit).toBe(3);
        const withLimit = (s: GameState): GameState => ({ ...s, config: created.config });
        const place = (s: GameState, x: number) => validateAction(s, { type: 'PLACE', actorId: 'p1', expectedTurn: s.turnNumber, actionId: 'pose', placements: [{ tileId: s.players[0]?.hand[0] ?? '', x, y: 0 }] });
        // Ligne de trois tuiles qui touche la borne : x = 4 est contigu mais hors du plateau.
        const atEdge = withLimit(stateFrom({ board: [[1, 0, 0, 0], [2, 0, 0, 1], [3, 0, 0, 2]], hands: [[[0, 3]], [[5, 5]]] }));
        const outside = place(atEdge, 4);
        expect(outside.ok).toBe(false);
        if (!outside.ok) expect(outside.code).toBe('OUT_OF_BOUNDS');
        // Même ligne décalée d'un cran : x = 3, contigu, est sur la borne et accepté.
        const inside = withLimit(stateFrom({ board: [[0, 0, 0, 0], [1, 0, 0, 1], [2, 0, 0, 2]], hands: [[[0, 3]], [[5, 5]]] }));
        expect(place(inside, 3).ok).toBe(true);
        // Le générateur ne propose aucune case au-delà de la borne, ni sur ces positions ni au fil d'une partie.
        const checkMoves = (s: GameState, where: string): number => {
            const player = s.players[s.currentPlayerIndex];
            if (!player) throw new Error('joueur courant');
            const moves = [...scanLegalMoves(s, player.id)].filter(m => m !== null);
            for (const m of moves) for (const p of m.placements) expect(Math.max(Math.abs(p.x), Math.abs(p.y)), `${where} : ${p.x}, ${p.y}`).toBeLessThanOrEqual(3);
            return moves.length;
        };
        expect(checkMoves(atEdge, 'ligne au bord')).toBeGreaterThan(0);
        expect(checkMoves(inside, 'ligne en deçà')).toBeGreaterThan(0);
        let generated = 0;
        playGame({ ...configOf(2), rules: { coordinateLimit: 3 } }, 'limite-3', { maxTurns: 80, each: session => { if (session.state.phase !== 'finished') generated += checkMoves(session.state, `tour ${session.state.turnNumber}`); } });
        expect(generated).toBeGreaterThan(0);
    });
});
