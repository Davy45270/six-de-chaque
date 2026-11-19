import { projectPublicState, scanDeadPosition, stateHash, validateAction } from '@six-de-chaque/engine';
import type { GameAction, PlayerState, Session } from '@six-de-chaque/engine';
import { decide } from '@six-de-chaque/ai';
import type { AiClient } from '@six-de-chaque/ai';

// Sans pose, chaque balayage examine au plus quatre cases par tuile présente.
// Le budget couvre le balayage de la main puis celui des tuiles hors plateau.
const FALLBACK_BUDGET_NODES = 1024;
const FALLBACK_SLICE_NODES = 32;

function* searchFallback(state: Session['state'], player: PlayerState, exchange: GameAction | null): Generator<number, GameAction | null, void> {
    // Garder la première pose légale. La position morte se vérifie avec la réserve et les mains réelles.
    const { move, evaluatedNodes } = yield* decide(
        projectPublicState(state, player.id), player.hand, player.id, 'beginner', FALLBACK_BUDGET_NODES, state.turnNumber, false, 1
    );
    if (move.type !== 'EXCHANGE') return move;
    const { actorId, expectedTurn, actionId } = move;
    const probe = scanDeadPosition(state);
    for (let nodes = evaluatedNodes; nodes < FALLBACK_BUDGET_NODES; nodes++) {
        const result = probe.next();
        if (result.done) return { type: 'PASS', actorId, expectedTurn, actionId };
        if (result.value) return exchange;
        yield 1;
    }
    return exchange;
}

async function fallbackMove(session: Session, player: PlayerState, isCurrent: () => boolean): Promise<GameAction | null> {
    const { state, events } = session;
    const used = new Set(events.map(event => event.actionId));
    let actionId = `repli-${state.turnNumber}`;
    while (used.has(actionId)) actionId += '-';
    const base = { actorId: player.id, expectedTurn: state.turnNumber, actionId };
    const exchange = { ...base, type: 'EXCHANGE', tileIds: player.hand.slice(0, 1) } as const;
    const cheapMove = validateAction(state, exchange).ok ? exchange : null;
    const search = searchFallback(state, player, cheapMove);
    let nodes = 0;
    while (isCurrent()) {
        const sliceEnd = nodes + FALLBACK_SLICE_NODES;
        while (nodes < sliceEnd) {
            try {
                const result = search.next();
                if (result.done) return result.value && { ...result.value, actionId };
                nodes += Math.max(1, result.value);
            } catch (error) {
                // La décision signale l'épuisement sans candidat par une exception.
                if (nodes >= FALLBACK_BUDGET_NODES) return cheapMove;
                throw error;
            }
        }
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return null;
}

export async function chooseAiMove(session: Session, client: AiClient | null, isCurrent: () => boolean): Promise<GameAction | null> {
    const { state } = session;
    const player = state.players[state.currentPlayerIndex];
    if (state.phase === 'finished' || player?.type !== 'ai' || !isCurrent()) return null;
    if (!client) return fallbackMove(session, player, isCurrent);

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
    return fallbackMove(session, player, isCurrent);
}
