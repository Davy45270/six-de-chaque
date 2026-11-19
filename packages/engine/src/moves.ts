import { scanLegalMoves } from './move-scan';
import type { Move } from './move-scan';
import { validateAction } from './validate';
import type { GameState, PlaceAction } from './types';

export { findAnyLegalPlacement, isDeadPosition, moveKey, scanDeadPosition } from './move-scan';
export type { Move } from './move-scan';

export function getLegalMoves(state: GameState, playerId: string, limit = Infinity): Move[] {
    if (limit <= 0 || state.phase === 'finished' || state.players[state.currentPlayerIndex]?.id !== playerId) return [];
    const base = { type: 'PLACE', actorId: playerId, expectedTurn: state.turnNumber, actionId: 'pose' } satisfies Omit<PlaceAction, 'placements'>;
    const moves: Move[] = [];
    for (const move of scanLegalMoves(state, playerId, placements => validateAction(state, { ...base, placements }).ok)) {
        if (move) moves.push(move);
        if (moves.length >= limit) break;
    }
    return moves.slice(0, limit);
}
