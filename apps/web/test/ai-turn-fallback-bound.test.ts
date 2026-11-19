import { expect, it } from 'vitest';
import { cellKey, isDeadPosition, validateAction } from '@six-de-chaque/engine';
import type { Session } from '@six-de-chaque/engine';
import { chooseAiMove } from '../src/game/ai-turn';
import { stateFrom } from '../../../packages/engine/test/fixtures';

// Pire cas du repli déterministe (sans Worker) : les 108 tuiles en jeu, aucune pose possible pour personne.
// Deux carrés 6 × 6 fermés au plateau (ligne = couleur, colonne = forme : chaque ligne et chaque colonne a déjà
// six tuiles), soit 72 tuiles, les 36 autres en mains (6 + 6) et en réserve (24). Le repli parcourt tout le
// plateau sans trouver de pose, puis doit rendre un coup légal en moins de 50 ms (médiane de 5).
// Un plateau de 108 tuiles avec une main non vide ne peut pas être fermé : chaque tuile de la main laisse un
// trou de son type dans l'un des trois carrés, où elle se pose.
function deadAiTurn(): Session {
    const square = (x0: number): Array<[number, number, number, number]> =>
        Array.from({ length: 36 }, (_, i) => [x0 + (i % 6), Math.floor(i / 6), Math.floor(i / 6), i % 6]);
    const state = stateFrom({
        board: [...square(0), ...square(20)],
        hands: [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]],
        types: ['ai', 'human'], current: 0, phase: 'playing', turn: 40
    });
    return { state, events: [] };
}

it('the fallback returns a legal move within 50 ms on a 108-tile board with no placement', async () => {
    const session = deadAiTurn();
    const { state } = session;
    expect(state.players[state.currentPlayerIndex]?.type).toBe('ai');
    const onBoard = Object.keys(state.board).length;
    expect(onBoard + state.players.reduce((n, p) => n + p.hand.length, 0) + state.bag.length).toBe(108);
    expect(onBoard).toBe(72);
    expect(state.board[cellKey(25, 5)]).toBeDefined();
    expect(isDeadPosition(state)).toBe(true);

    await chooseAiMove(session, null, () => true); // échauffement
    const times: number[] = [];
    let move = null;
    for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        move = await chooseAiMove(session, null, () => true);
        times.push(performance.now() - t0);
    }
    expect(move).not.toBeNull();
    if (!move) return;
    expect(validateAction(state, move).ok).toBe(true);
    expect(move.type).toBe('PASS');
    const median = [...times].sort((a, b) => a - b)[2] ?? Infinity;
    console.log(`repli : plateau ${onBoard} tuiles, médiane ${median.toFixed(2)} ms (${times.map(t => t.toFixed(1)).join(', ')})`);
    expect(median).toBeLessThan(50);
});
