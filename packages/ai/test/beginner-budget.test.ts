import { expect, it } from 'vitest';
import { createGame, projectPublicState, scanLegalMoves, submit } from '@six-de-chaque/engine';
import type { GameConfig, Session } from '@six-de-chaque/engine';
import { decideNow } from '../src/policies';
import { nextAction } from '../../engine/test/play';

it('beginner finds a legal action within budget in seeded four-player games', () => {
    const config: GameConfig = { players: [
        { id: 'humain', name: 'Humain', type: 'human' },
        ...Array.from({ length: 3 }, (_, i) => ({
            id: `ordi-${i}`, name: `Ordinateur ${i}`, type: 'ai' as const, aiLevel: 'beginner' as const
        }))
    ] };
    const runs = 20;
    let turns = 0, loaded = 0, largestBoard = 0, maxNodes = 0;
    let maxFirstPlacementNodes = 0, maxWithoutPlacement = 0;
    for (let i = 0; i < runs; i++) {
        let session: Session = { state: createGame(config, `quatre-débutants-${i}`), events: [] };
        while (session.state.phase !== 'finished') {
            const { state } = session;
            if (state.turnNumber >= 200) throw new Error(`Partie ${i} encore en cours`);
            const player = state.players[state.currentPlayerIndex]!;
            let action;
            if (player.type === 'ai') {
                const boardSize = Object.keys(state.board).length;
                largestBoard = Math.max(largestBoard, boardSize);
                turns++;
                if (boardSize >= 80) loaded++;
                // Même demande que l'application : le Worker doit déterminer seul si la passe est légale.
                const view = projectPublicState(state, player.id);
                const decision = decideNow(view, player.hand, player.id, 'beginner', 20_000, state.turnNumber);
                action = decision.move;
                if (action.type === 'PLACE') {
                    let first = 0;
                    for (const node of scanLegalMoves(state, player.id)) {
                        first++;
                        if (node) break;
                    }
                    maxFirstPlacementNodes = Math.max(maxFirstPlacementNodes, first);
                } else {
                    maxWithoutPlacement = Math.max(maxWithoutPlacement, decision.evaluatedNodes);
                }
                maxNodes = Math.max(maxNodes, decision.evaluatedNodes);
            } else action = nextAction(session);
            const next = submit(session, action);
            expect(next.result.ok).toBe(true);
            session = next.session;
        }
    }
    expect(loaded).toBeGreaterThan(0);
    // Avant la première pose, un nœud au plus par case frontière. Sans pose pour la main,
    // la détection de position morte peut parcourir la frontière une deuxième fois.
    expect(maxFirstPlacementNodes).toBeLessThanOrEqual(4 * 108);
    expect(maxWithoutPlacement).toBeLessThanOrEqual(2 * 4 * 108);
    expect(maxNodes).toBeLessThanOrEqual(20_000);
    console.info({ runs, turns, loaded, largestBoard, maxNodes, maxFirstPlacementNodes, maxWithoutPlacement });
});
