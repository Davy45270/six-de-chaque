// Session : un état et son journal. `submit` refuse un identifiant d'action déjà journalisé (anti-rejeu).
import { applyAction, GENESIS_HASH } from './apply';
import type { GameEvent, Transition } from './apply';
import { reject } from './reject';
import type { GameAction, GameState } from './types';

export interface Session { state: GameState; events: GameEvent[] }
export const lastHash = (session: Session): string => session.events[session.events.length - 1]?.hash ?? GENESIS_HASH;

export function submit(session: Session, action: GameAction): { session: Session; result: Transition } {
    if (session.events.some(e => e.actionId === action.actionId)) {
        return { session, result: { ok: false, error: reject('DUPLICATE_ACTION', 'Cette action a déjà été jouée.'), state: session.state } };
    }
    const result = applyAction(session.state, action, lastHash(session));
    if (!result.ok) return { session, result };
    return { session: { state: result.state, events: [...session.events, result.event] }, result };
}
