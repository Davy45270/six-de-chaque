import { applyAction, DEFAULT_RULES, seedToState, tilesRecord } from '@six-de-chaque/engine';
import type { GameState, Placement } from '@six-de-chaque/engine';
import type { PuzzlePosition } from '@six-de-chaque/contracts';

/** Projection solo. Les tuiles hors plateau, main et pioche sont mises de côté. */
export function initialPuzzleState(puzzle: PuzzlePosition): GameState {
    const board = Object.fromEntries(Object.entries(puzzle.board).sort(([a], [b]) => a < b ? -1 : 1));
    return {
        version: puzzle.ruleVersion,
        seed: puzzle.seed,
        rngState: seedToState(puzzle.seed),
        phase: Object.keys(board).length === 0 ? 'opening' : 'playing',
        turnNumber: 0,
        currentPlayerIndex: 0,
        tilesById: tilesRecord(),
        board,
        players: [
            { id: 'joueur', name: 'Joueur', type: 'human', hand: [...puzzle.hand], score: 0 },
            { id: 'absent', name: 'Absent', type: 'human', hand: [], score: 0 }
        ],
        bag: puzzle.drawPolicy === 'ordered' ? [...puzzle.drawOrder] : [],
        consecutivePasses: 0,
        config: { ...DEFAULT_RULES },
        endReason: null
    };
}

export function playPuzzleTurn(state: GameState, placements: Placement[]): GameState | null {
    const result = applyAction(state, {
        type: 'PLACE', actorId: 'joueur', actionId: `pose-${state.turnNumber}`, expectedTurn: state.turnNumber, placements
    });
    // Le défi enchaîne les poses du joueur, sans tour adverse.
    return result.ok ? { ...result.state, currentPlayerIndex: 0 } : null;
}
