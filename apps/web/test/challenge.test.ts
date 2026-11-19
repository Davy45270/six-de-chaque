import { describe, expect, it } from 'vitest';
import { GAME_VERSION, tileId } from '@six-de-chaque/engine';
import type { Placement } from '@six-de-chaque/engine';
import { validatePuzzle } from '@six-de-chaque/contracts';
import type { PuzzlePosition } from '@six-de-chaque/puzzles';
import campaign from '../../../packages/puzzles/data/defis.json';
import { reduceChallenge, referenceSteps, startChallenge } from '../src/game/challenge';
import type { ChallengeRun } from '../src/game/challenge';

const base: PuzzlePosition = {
    seed: 'défi-test', ruleVersion: GAME_VERSION, turnLimit: 2, targetScore: 4,
    board: { '0:0': tileId(0, 0, 0) }, hand: [tileId(0, 1, 0), tileId(0, 2, 0)], drawPolicy: 'none'
};
const first = { tileId: tileId(0, 1, 0), x: 1, y: 0 };
const second = { tileId: tileId(0, 2, 0), x: 2, y: 0 };
function place(puzzle: PuzzlePosition, run: ChallengeRun, { tileId, x, y }: Placement): ChallengeRun {
    const selected = reduceChallenge(puzzle, run, { t: 'select', tileId });
    const ghost = reduceChallenge(puzzle, selected, { t: 'placeAt', x, y });
    return reduceChallenge(puzzle, ghost, { t: 'validate' });
}

describe('challenge controller', () => {
    it('plays solo with the fixed hand and scores a win on the final turn', () => {
        const start = startChallenge(base);
        expect(start.ui.session.state).toMatchObject({ board: base.board, bag: [], players: [{ hand: base.hand }] });
        const one = place(base, start, first);
        expect(one).toMatchObject({ status: 'playing', ui: { session: { state: { turnNumber: 1, currentPlayerIndex: 0, players: [{ score: 2 }] } } } });
        const two = place(base, one, second);
        expect(two).toMatchObject({ status: 'won', ui: { session: { state: { turnNumber: 2, players: [{ score: 11 }] } } } });
        expect(reduceChallenge(base, two, { t: 'validate' })).toBe(two);
        expect(start.ui.session.state.board).toEqual(base.board);
    });

    it('rejects invalid poses and exchange or pass shortcuts without consuming a turn', () => {
        const start = startChallenge(base);
        expect(reduceChallenge(base, start, { t: 'toggleExchange' })).toBe(start);
        expect(reduceChallenge(base, start, { t: 'pass' })).toBe(start);
        const invalid = place(base, start, { ...first, x: 7 });
        expect(invalid.ui.previewError).toBeTruthy();
        expect(invalid.ui.session).toBe(start.ui.session);
    });

    it('marks a missed challenge at the turn limit or when no pose remains', () => {
        const limited = { ...base, turnLimit: 1 };
        expect(place(limited, startChallenge(limited), first).status).toBe('lost');
        const blocked = { ...base, hand: [tileId(1, 1, 0)] };
        expect(startChallenge(blocked).status).toBe('lost');
    });

    it('draws from drawOrder and can succeed before the last turn', () => {
        const drawOrder = [tileId(1, 0, 0), tileId(2, 0, 0), tileId(3, 0, 0), tileId(4, 0, 0), tileId(5, 0, 0), tileId(1, 1, 0)];
        const ordered: PuzzlePosition = { ...base, targetScore: 2, drawPolicy: 'ordered', drawOrder };
        const one = place(ordered, startChallenge(ordered), first);
        expect(one.status).toBe('won');
        expect(one.ui.session.state.players[0]?.hand).toEqual([second.tileId, ...drawOrder.slice(0, 5)]);
        expect(one.ui.session.state.bag).toEqual(drawOrder.slice(5));
    });

    it('replays every campaign reference from its initial board to its recorded score', () => {
        for (const raw of campaign) {
            const checked = validatePuzzle(raw);
            if (!checked.ok) throw new Error(checked.errors.join(', '));
            const steps = referenceSteps(checked.value);
            expect(steps[0]?.board).toEqual(raw.board);
            expect(steps).toHaveLength(1 + (raw.solutions[0]?.turns.length ?? 0));
            expect(steps.at(-1)?.players[0]?.score).toBe(raw.solutions[0]?.score);
        }
    });
});
