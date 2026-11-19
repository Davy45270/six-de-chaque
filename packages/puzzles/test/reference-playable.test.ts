import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { initialPuzzleState, playPuzzleTurn } from '../src/index';
import type { Puzzle } from '../src/index';

// L'interface clôt un défi dès que l'objectif est atteint. La solution de référence montrée au joueur
// (« Voir une solution », la première du fichier) doit donc pouvoir être jouée en entier : l'objectif n'est
// atteint qu'au dernier coup, jamais avant.
const campaign = JSON.parse(readFileSync(new URL('../data/defis.json', import.meta.url), 'utf8')) as Puzzle[];

it('the twelve shipped challenges are all checked', () => {
    expect(campaign).toHaveLength(12);
});

for (const puzzle of campaign) {
    it(`challenge ${puzzle.seed}: the reference solution is playable to its last move`, () => {
        const reference = puzzle.solutions[0];
        expect(reference, 'référence absente').toBeDefined();
        const turns = reference?.turns ?? [];
        expect(turns.length).toBeGreaterThan(0);
        expect(turns.length).toBeLessThanOrEqual(puzzle.turnLimit);
        let state = initialPuzzleState(puzzle);
        const scores: number[] = [];
        for (const placements of turns) {
            const next = playPuzzleTurn(state, placements);
            expect(next, `coup ${scores.length + 1} refusé`).not.toBeNull();
            if (!next) return;
            state = next;
            scores.push(state.players[0]?.score ?? 0);
        }
        const early = scores.slice(0, -1).findIndex(score => score >= puzzle.targetScore);
        expect(early, `objectif ${puzzle.targetScore} atteint dès le coup ${early + 1} sur ${turns.length} (scores ${scores.join(', ')})`).toBe(-1);
        expect(scores.at(-1)).toBeGreaterThanOrEqual(puzzle.targetScore);
    });
}
