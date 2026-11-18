// Parties simulées pour les tests : politique « premier coup légal » ou tirage parmi les coups légaux.
import { createGame } from '../src/create';
import { getLegalMoves } from '../src/moves';
import { submit } from '../src/session';
import type { Session } from '../src/session';
import type { GameAction, GameConfig } from '../src/types';
import { bot, human } from './fixtures';

export const configOf = (n: number): GameConfig => ({ players: [human('h0'), ...Array.from({ length: n - 1 }, (_, i) => (i % 2 ? human(`h${i + 1}`) : bot(`b${i + 1}`)))] });

/** Action suivante : `pick` choisit parmi au plus `limit` coups légaux ; sans pose, échange d'une tuile ou passe. */
export function nextAction(session: Session, pick: (n: number) => number = () => 0, limit = 1): GameAction {
    const s = session.state;
    const player = s.players[s.currentPlayerIndex];
    if (!player) throw new Error('joueur courant');
    const base = { actorId: player.id, expectedTurn: s.turnNumber, actionId: `a-${s.turnNumber}` };
    const moves = getLegalMoves(s, player.id, limit);
    const move = moves[pick(moves.length)] ?? moves[0];
    if (move) return { ...base, type: 'PLACE', placements: move.placements };
    if (s.bag.length > 0) return { ...base, type: 'EXCHANGE', tileIds: player.hand.slice(0, Math.min(s.bag.length, 1 + (s.turnNumber % player.hand.length))) };
    return { ...base, type: 'PASS' };
}

export function playGame(config: GameConfig, seed: string, opts: { pick?: (n: number) => number; limit?: number; maxTurns?: number; each?: (s: Session) => void } = {}): Session {
    let session: Session = { state: createGame(config, seed), events: [] };
    for (let i = 0; i < (opts.maxTurns ?? 2000) && session.state.phase !== 'finished'; i++) {
        const { session: next, result } = submit(session, nextAction(session, opts.pick, opts.limit));
        if (!result.ok) throw new Error(`action refusée : ${result.error.code} ${result.error.detail}`);
        session = next;
        opts.each?.(session);
    }
    return session;
}
