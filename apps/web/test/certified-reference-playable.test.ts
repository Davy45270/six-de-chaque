import { expect, it } from 'vitest';
import { GAME_VERSION } from '@six-de-chaque/engine';
import type { Placement } from '@six-de-chaque/engine';
import { certifyCandidate } from '@six-de-chaque/puzzles';
import type { PuzzlePosition } from '@six-de-chaque/puzzles';
import { reduceChallenge, startChallenge } from '../src/game/challenge';
import type { ChallengeRun } from '../src/game/challenge';

// Le contrôleur clôt un défi dès que l'objectif est atteint. Une référence certifiée doit donc se jouer
// en entier dans le défi, et y obtenir le score qu'elle annonce.
const position: PuzzlePosition = {
    seed: 'reference-prolongee', ruleVersion: GAME_VERSION, turnLimit: 2, targetScore: 3,
    board: { '0:0': 't-000' }, hand: ['t-003', 't-006', 't-009'], drawPolicy: 'none'
};

function playTurn(run: ChallengeRun, placements: readonly Placement[]): ChallengeRun {
    let current = run;
    for (const { tileId, x, y } of placements) {
        current = reduceChallenge(position, current, { t: 'select', tileId });
        current = reduceChallenge(position, current, { t: 'placeAt', x, y });
    }
    return reduceChallenge(position, current, { t: 'validate' });
}

it('a certified reference is played to its last move in the challenge controller and reaches its announced score', () => {
    const puzzle = certifyCandidate(position, 10_000, 10_000);
    expect(puzzle, 'candidat non certifié').not.toBeNull();
    const reference = puzzle?.solutions[0];
    expect(reference, 'référence absente').toBeDefined();
    if (!reference) return;

    let run = startChallenge(position);
    const played: number[] = [];
    for (const [index, placements] of reference.turns.entries()) {
        expect(run.status, `défi clos (${run.status}) avant la pose ${index + 1} sur ${reference.turns.length}, `
            + `score ${run.ui.session.state.players[0]?.score ?? 0}, référence annoncée à ${reference.score}`).toBe('playing');
        const before = run.ui.session.state.turnNumber;
        run = playTurn(run, placements);
        expect(run.ui.session.state.turnNumber, `pose ${index + 1} refusée par le contrôleur`).toBe(before + 1);
        played.push(run.ui.session.state.players[0]?.score ?? 0);
    }
    expect(played).toHaveLength(reference.turns.length);
    expect(run.status).toBe('won');
    expect(run.ui.session.state.players[0]?.score).toBe(reference.score);
});
