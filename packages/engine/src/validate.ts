// Validation d'une action, sans mutation. Ordre : cycle d'un tour (phase, acteur, tour), puis règles de l'action.
import { findAnyLegalPlacement, isDeadPosition } from './moves';
import { validatePlacements } from './placement';
import { OK, reject } from './reject';
import type { Validation } from './reject';
import { GAME_VERSION } from './types';
import type { ExchangeAction, GameAction, GameState, PlayerState, TileId } from './types';

export type { RejectCode, Rejection, Validation } from './reject';
export { validatePlacements } from './placement';

function validateTurn(state: GameState, action: GameAction): Validation {
    if (state.phase === 'finished') return reject('GAME_OVER', 'La partie est terminée.');
    const current = state.players[state.currentPlayerIndex];
    if (current?.id !== action.actorId) return reject('NOT_YOUR_TURN', 'Ce n’est pas ton tour.');
    if (action.expectedTurn !== state.turnNumber) return reject('WRONG_TURN', 'Le tour a changé entre-temps.');
    return OK;
}

function validateExchange(state: GameState, hand: readonly TileId[], action: ExchangeAction): Validation {
    if (state.phase === 'opening') return reject('EXCHANGE_IN_OPENING', 'Le premier coup de la partie est une pose.');
    if (action.tileIds.length === 0) return reject('EMPTY', 'Choisis au moins une tuile à échanger.');
    if (new Set(action.tileIds).size !== action.tileIds.length) return reject('DUPLICATE_TILE', 'Une même tuile est rendue deux fois.');
    const inHand = new Set(hand);
    if (action.tileIds.some(id => !inHand.has(id))) return reject('NOT_IN_HAND', 'Cette tuile n’est pas dans ta main.');
    if (state.bag.length < action.tileIds.length) return reject('BAG_TOO_SMALL', `La réserve n’a plus que ${state.bag.length} tuile(s).`);
    return OK;
}

export function validateAction(state: GameState, action: GameAction): Validation {
    if ((state.version as number) !== GAME_VERSION) return reject('VERSION', 'Version de partie incompatible.');
    const turn = validateTurn(state, action);
    if (!turn.ok) return turn;
    // validateTurn garantit que le joueur courant existe et agit.
    const hand = (state.players[state.currentPlayerIndex] as PlayerState).hand;
    switch (action.type) {
        case 'PLACE': return validatePlacements(state, hand, action.placements);
        case 'EXCHANGE': return validateExchange(state, hand, action);
        case 'PASS':
            if (findAnyLegalPlacement(state, action.actorId)) return reject('PASS_NOT_ALLOWED', 'Tu peux encore poser une tuile.');
            // Réserve non vide : l'échange reste obligatoire, sauf en position morte (plus rien n'est posable).
            if (state.bag.length > 0 && !isDeadPosition(state)) return reject('PASS_NOT_ALLOWED', 'Tu peux encore échanger des tuiles.');
            return OK;
    }
}
