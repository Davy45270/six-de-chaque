import { getLegalMoves, projectPublicState, stateHash, validateAction } from '@six-de-chaque/engine';
import type { GameAction, PlayerState, Session } from '@six-de-chaque/engine';
import type { AiClient } from '@six-de-chaque/ai';

function fallbackMove(session: Session, player: PlayerState): GameAction | null {
    const { state, events } = session;
    const used = new Set(events.map(event => event.actionId));
    let actionId = `repli-${state.turnNumber}`;
    while (used.has(actionId)) actionId += '-';
    const base = { actorId: player.id, expectedTurn: state.turnNumber, actionId };
    const first = getLegalMoves(state, player.id, 1)[0];
    if (first) return { ...base, type: 'PLACE', placements: first.placements };

    // L’ordinateur passe en position morte, même si la réserve permettrait un échange.
    const pass = { ...base, type: 'PASS' } as const;
    if (validateAction(state, pass).ok) return pass;
    const exchange = { ...base, type: 'EXCHANGE', tileIds: player.hand.slice(0, 1) } as const;
    return validateAction(state, exchange).ok ? exchange : null;
}

export async function chooseAiMove(session: Session, client: AiClient | null, isCurrent: () => boolean): Promise<GameAction | null> {
    const { state } = session;
    const player = state.players[state.currentPlayerIndex];
    if (state.phase === 'finished' || player?.type !== 'ai' || !isCurrent()) return null;
    if (!client) return fallbackMove(session, player);

    const gameHash = stateHash(state);
    const request = {
        type: 'REQUEST_MOVES' as const, gameHash, view: projectPublicState(state, player.id),
        hand: [...player.hand], playerId: player.id, level: player.aiLevel ?? 'beginner'
    };
    let budgetNodes = 20_000;
    let retriedStale = false;
    for (;;) {
        const response = await client.request({ ...request, budgetNodes }, () => isCurrent() ? gameHash : '');
        if (!isCurrent()) return null;
        if (response.status === 'ok') {
            const { move } = response.decision;
            if (validateAction(state, move).ok && !session.events.some(event => event.actionId === move.actionId)) return move;
        }
        if (response.status === 'stale' || response.status === 'cancelled') {
            if (retriedStale) break;
            retriedStale = true;
        } else {
            if (budgetNodes === 5_000) break;
            budgetNodes = 5_000;
        }
    }
    return fallbackMove(session, player);
}
