// Symétries du générateur : copies physiques identiques explorées une seule fois, cases frontière.
import { describe, expect, it } from 'vitest';
import { cellKey, getLegalMoves } from '../src/index';
import type { GameState, Placement, PlaceAction } from '../src/index';
import { moveKey, scanLegalMoves } from '../src/move-scan';
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

    it('the generator only starts from empty cells orthogonally adjacent to the board, accepted or not', () => {
        // La sonde voit chaque pose candidate, y compris celles que la validation refuserait (et non seulement les
        // coups acceptés que rend `getLegalMoves`). Deux passes : sonde qui refuse tout (exploration complète), puis
        // validation réelle (mélange d'acceptées et de refusées).
        const check = (state: GameState, where: string): number => {
            let seen = 0;
            const probe = (decide: (placements: Placement[]) => boolean) => (placements: Placement[]): boolean => {
                seen++;
                const first = placements[0];
                expect(first, `${where} : pose candidate vide`).toBeDefined();
                if (!first) return false;
                const cells = new Set<string>();
                for (const p of placements) {
                    expect(state.board[cellKey(p.x, p.y)], `${where} : case occupée ${p.x},${p.y}`).toBeUndefined();
                    cells.add(cellKey(p.x, p.y));
                }
                expect(cells.size, `${where} : deux tuiles sur une même case`).toBe(placements.length);
                const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.board[cellKey(first.x + (dx ?? 0), first.y + (dy ?? 0))] !== undefined);
                const empty = Object.keys(state.board).length === 0;
                expect(empty ? first.x === 0 && first.y === 0 : touching, `${where} : départ ${first.x},${first.y} hors frontière orthogonale`).toBe(true);
                return decide(placements);
            };
            const player = state.players[state.currentPlayerIndex];
            if (!player) throw new Error('joueur courant');
            const base = { type: 'PLACE', actorId: player.id, expectedTurn: state.turnNumber, actionId: 'pose' } satisfies Omit<PlaceAction, 'placements'>;
            for (const _ of scanLegalMoves(state, player.id, probe(() => false))) { /* exploration complète */ }
            for (const _ of scanLegalMoves(state, player.id, probe(placements => validateAction(state, { ...base, placements }).ok))) { /* idem */ }
            return seen;
        };
        // Plateau en coude : (-1,1) ou (2,-1) ne touchent le plateau qu'en diagonale ; un départ là serait refusé
        // par la validation et resterait invisible dans les coups acceptés.
        let checked = check(stateFrom({
            board: [[0, 0, 0, 0], [1, 0, 0, 2], [1, 1, 0, 1]],
            hands: [[[0, 3], [0, 4], [0, 5], [1, 0], [1, 1], [1, 2]], [[5, 5]]]
        }), 'plateau à coins');
        checked += check(stateFrom({ hands: [[[0, 0], [0, 1], [2, 2]], [[5, 5]]] }), 'plateau vide');
        for (const seed of ['frontière-1', 'frontière-2']) {
            playGame(configOf(2), seed, {
                maxTurns: 10,
                each: session => { if (session.state.phase === 'playing') checked += check(session.state, `${seed} tour ${session.state.turnNumber}`); }
            });
        }
        expect(checked).toBeGreaterThan(100);
    });

    it('identical copies never cause the same candidate to be validated twice', () => {
        /** Nombre de présentations à `accepts` de chaque clé canonique (positions, couleurs et formes). */
        const presentations = (state: GameState, decide: (placements: Placement[]) => boolean): Map<string, number> => {
            const counts = new Map<string, number>();
            for (const _ of scanLegalMoves(state, 'p1', placements => {
                const key = moveKey(state, placements);
                counts.set(key, (counts.get(key) ?? 0) + 1);
                return decide(placements);
            })) { /* exploration complète */ }
            return counts;
        };
        const twice = (counts: Map<string, number>): string[] => [...counts].filter(([, n]) => n > 1).map(([k]) => k);
        // Mains de mêmes paires (couleur, forme) : la première en double exemplaire de chaque paire.
        const doubledHand: Array<[number, number]> = [[0, 1], [0, 1], [0, 2], [0, 2], [1, 0], [1, 0]];
        const singleHand: Array<[number, number]> = [[0, 1], [0, 2], [1, 0]];
        for (const [where, board] of [
            ['tuile seule', [[0, 0, 0, 0]]],
            ['plateau en croix', [[0, 0, 0, 0], [1, 0, 0, 3], [0, 1, 2, 0], [-1, 0, 4, 0]]]
        ] as Array<[string, Board]>) {
            const doubled = stateFrom({ board, hands: [doubledHand, [[5, 5]]] });
            const single = stateFrom({ board, hands: [singleHand, [[5, 5]]] });
            // Validation réelle : aucune clé n'est présentée deux fois avec la main à doublons.
            const real = presentations(doubled, legal(doubled));
            expect(real.size, where).toBeGreaterThan(0);
            expect(twice(real), `${where} : poses validées deux fois`).toEqual([]);
            // Sonde qui refuse tout : rien n'est absorbé par la mémoire des coups trouvés. Les répétitions qui restent
            // viennent des chemins symétriques (deux cases de départ d'une même ligne), présentes aussi sans doublon ;
            // les copies identiques n'en ajoutent aucune, clé par clé.
            const probeDoubled = presentations(doubled, () => false);
            const probeSingle = presentations(single, () => false);
            expect(probeSingle.size, where).toBeGreaterThan(0);
            expect([...probeDoubled].sort(), `${where} : présentations par clé`).toEqual([...probeSingle].sort());
        }
    });
});
