import { findAnyLegalPlacement } from '@six-de-chaque/engine';
import type { GameConfig } from '@six-de-chaque/engine';
import { initialPuzzleState, playPuzzleTurn } from '@six-de-chaque/puzzles';
import type { Puzzle, PuzzlePosition } from '@six-de-chaque/puzzles';
import { initialUi, reduce, withSession } from './controller';
import type { UiCommand, UiState } from './controller';

const SOLO: GameConfig = { players: [{ id: 'joueur', name: 'Toi', type: 'human' }] };

export interface ChallengeRun {
    ui: UiState;
    status: 'playing' | 'won' | 'lost';
}

export function challengeStatus(position: PuzzlePosition, ui: UiState): ChallengeRun['status'] {
    const state = ui.session.state;
    if ((state.players[0]?.score ?? 0) >= position.targetScore) return 'won';
    if (state.turnNumber >= position.turnLimit || state.phase === 'finished' || !findAnyLegalPlacement(state, 'joueur')) return 'lost';
    return 'playing';
}

export function startChallenge(position: PuzzlePosition): ChallengeRun {
    const initial = initialPuzzleState(position);
    const state = { ...initial, players: initial.players.slice(0, 1).map(p => ({ ...p, name: 'Toi' })) };
    const ui = initialUi({ state, events: [] }, SOLO, position.seed);
    return { ui, status: challengeStatus(position, ui) };
}

export function reduceChallenge(position: PuzzlePosition, run: ChallengeRun, command: UiCommand): ChallengeRun {
    if (run.status !== 'playing' || ['toggleExchange', 'toggleExchangeTile', 'confirmExchange', 'pass', 'hint'].includes(command.t)) return run;
    const { state: ui, submit } = reduce(run.ui, command);
    if (submit?.type !== 'PLACE') return { ...run, ui };
    const state = playPuzzleTurn(ui.session.state, submit.placements);
    if (!state) return run;
    const next = withSession(ui, { state, events: [] });
    return { ui: next, status: challengeStatus(position, next) };
}

/** Laisse le rejeu suivre la référence entière, y compris si l'objectif est atteint plus tôt. */
export function referenceSteps(puzzle: Puzzle) {
    let state = initialPuzzleState(puzzle);
    const steps = [state];
    const reference = puzzle.solutions[0];
    if (!reference) throw new Error(`Référence absente : ${puzzle.seed}`);
    for (const placements of reference.turns) {
        const next = playPuzzleTurn(state, placements);
        if (!next) throw new Error(`Référence invalide : ${puzzle.seed}`);
        steps.push(next);
        state = next;
    }
    return steps;
}
