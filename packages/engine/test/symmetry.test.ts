// Symétries du générateur : copies physiques identiques explorées une seule fois, cases frontière.
import { describe, expect, it } from 'vitest';
import { cellKey, getLegalMoves } from '../src/index';
import type { GameState, Placement, PlaceAction } from '../src/index';
import { scanLegalMoves } from '../src/move-scan';
import { validateAction } from '../src/validate';
import { stateFrom } from './fixtures';
import { configOf, playGame } from './play';

type Board = Array<[number, number, number, number, number?]>;

/** Parcourt tout le générateur ; compte les appels à `accepts` et rend les clés des coups produits. */
function explore(state: GameState, accepts: (placements: Placement[]) => boolean): { calls: number; keys: string[] } {
    let calls = 0;
    const keys: string[] = [];
    for (const move of scanLegalMoves(state, 'p1', placements => { calls++; return accepts(placements); })) if (move) keys.push(move.key);
    return { calls, keys: keys.sort() };
}

const legal = (state: GameState) => (placements: Placement[]): boolean => {
    const base = { type: 'PLACE', actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'pose' } satisfies Omit<PlaceAction, 'placements'>;
    return validateAction(state, { ...base, placements }).ok;
};

describe('move generator symmetries', () => {
    it('equivalent physical copies are explored once, not once per copy', () => {
        // Les deux mains portent les mêmes paires (couleur, forme) ; la première en double exemplaire.
        const board: Board = [[0, 0, 0, 0], [1, 0, 0, 3], [0, 1, 2, 0], [-1, 0, 4, 0]];
        const doubled = stateFrom({ board, hands: [[[0, 1], [0, 1], [0, 2], [0, 2], [1, 0], [1, 0]], [[5, 5]]] });
        const single = stateFrom({ board, hands: [[[0, 1], [0, 2], [1, 0]], [[5, 5]]] });
        const ids = doubled.players[0]?.hand ?? [];
        expect(new Set(ids).size).toBe(6);

        // Sonde qui refuse tout : chaque pose candidate atteint `accepts`, aucune n'est absorbée par le dédoublonnage.
        const probeDoubled = explore(doubled, () => false);
        const probeSingle = explore(single, () => false);
        expect(probeSingle.calls).toBeGreaterThan(0);
        expect(probeDoubled.calls).toBe(probeSingle.calls);

        // Validation réelle : même nombre d'appels et mêmes coups rendus.
        const realDoubled = explore(doubled, legal(doubled));
        const realSingle = explore(single, legal(single));
        expect(realSingle.keys.length).toBeGreaterThan(0);
        expect(realDoubled.calls).toBe(realSingle.calls);
        expect(realDoubled.keys).toEqual(realSingle.keys);
    });

    it('frontier cells are empty and orthogonally adjacent to the board', () => {
        const check = (state: GameState, where: string): number => {
            const player = state.players[state.currentPlayerIndex];
            if (!player) throw new Error('joueur courant');
            const moves = getLegalMoves(state, player.id);
            for (const move of moves) {
                const first = move.placements[0];
                if (!first) throw new Error(`${where} : coup vide`);
                for (const p of move.placements) expect(state.board[cellKey(p.x, p.y)], `${where} : case occupée ${p.x},${p.y}`).toBeUndefined();
                const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.board[cellKey(first.x + (dx ?? 0), first.y + (dy ?? 0))] !== undefined);
                expect(touching, `${where} : première tuile ${first.x},${first.y} sans voisin orthogonal`).toBe(true);
            }
            return moves.length;
        };
        // Plateau en coude : des cases comme (-1,1) ou (2,-1) ne touchent le plateau qu'en diagonale.
        let checked = check(stateFrom({
            board: [[0, 0, 0, 0], [1, 0, 0, 2], [1, 1, 0, 1]],
            hands: [[[0, 3], [0, 4], [0, 5], [1, 0], [1, 1], [1, 2]], [[5, 5]]]
        }), 'plateau à coins');
        for (const seed of ['frontière-1', 'frontière-2']) {
            playGame(configOf(2), seed, {
                maxTurns: 12,
                each: session => { if (session.state.phase === 'playing') checked += check(session.state, `${seed} tour ${session.state.turnNumber}`); }
            });
        }
        expect(checked).toBeGreaterThan(0);
    });
});
