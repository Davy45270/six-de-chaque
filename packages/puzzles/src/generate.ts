import { decideNow } from '@six-de-chaque/ai';
import { createGame, GAME_VERSION, projectPublicState, replay, submit, validateAction } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, GameEvent, Session } from '@six-de-chaque/engine';
import type { Puzzle, PuzzlePosition } from '@six-de-chaque/contracts';
import { findBestScore, solutionHash, solve } from './solve';

/** Au-delà de huit séquences gagnantes, le défi offre trop de réponses. */
export const MAX_SOLUTIONS = 8;
export const DEFAULT_BUDGET_NODES = 12_000;

export interface GenerateOptions {
    turnLimit?: number;
    /** Tour de la partie source à partir duquel essayer les positions. */
    startTurn?: number;
    /** Nombre maximal de positions successives à essayer. */
    attempts?: number;
    budgetNodes?: number;
    maxSolutions?: number;
    drawPolicy?: 'none' | 'ordered';
}

export function playSource(seed: string, turns: number): { config: GameConfig; events: GameEvent[] } {
    // La configuration du moteur exige un siège humain. La même politique pilote les deux sièges.
    const config: GameConfig = { players: [
        { id: 'source', name: 'Source', type: 'human' },
        { id: 'ordi', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner' }
    ] };
    let session: Session = { state: createGame(config, seed), events: [] };
    while (session.events.length < turns && session.state.phase !== 'finished') {
        const state = session.state;
        const player = state.players[state.currentPlayerIndex];
        if (!player) throw new Error('joueur source absent');
        const pass: GameAction = { type: 'PASS', actorId: player.id, expectedTurn: state.turnNumber, actionId: 'passe' };
        // La campagne historique échantillonne les 128 premières poses légales.
        const { move } = decideNow(projectPublicState(state, player.id), player.hand, player.id, 'beginner',
            20_000, state.turnNumber, validateAction(state, pass).ok, 128);
        const next = submit(session, move);
        if (!next.result.ok) throw new Error(next.result.error.detail);
        session = next.session;
    }
    return { config, events: session.events };
}

export function certifyCandidate(position: PuzzlePosition, budgetNodes: number, maxSolutions = MAX_SOLUTIONS): Puzzle | null {
    const { status, exhaustive, solutions, best } = solve(position, budgetNodes);
    if (status !== 'solved' || !exhaustive || !best || solutions.length > maxSolutions) return null;
    if (solutions.some(s => s.turns.length === 1 && s.turns[0]?.length === 1)) return null;
    return { ...position, solutions, solutionHash: solutionHash(best), uniqueness: solutions.length === 1 ? 'unique' : 'multiple' };
}

export function generate(seed: string, options: GenerateOptions = {}): Puzzle | null {
    const { turnLimit = 2, startTurn = 5, attempts = 8, budgetNodes = DEFAULT_BUDGET_NODES, maxSolutions = MAX_SOLUTIONS,
        drawPolicy = 'none' } = options;
    const { config, events } = playSource(seed, startTurn + attempts - 1);
    for (let turn = startTurn; turn < startTurn + attempts && turn <= events.length; turn++) {
        const state = replay(config, seed, events.slice(0, turn));
        const hand = state.players[state.currentPlayerIndex]?.hand;
        if (state.phase !== 'playing' || !hand?.length) continue;
        const position: PuzzlePosition = {
            board: state.board, hand, turnLimit, targetScore: 1, ruleVersion: GAME_VERSION, seed,
            ...(drawPolicy === 'ordered' ? { drawPolicy, drawOrder: state.bag } : { drawPolicy })
        };
        const targetScore = findBestScore(position, budgetNodes);
        if (!targetScore) continue;
        const puzzle = certifyCandidate({ ...position, targetScore }, budgetNodes, maxSolutions);
        if (puzzle) return puzzle;
    }
    return null;
}
