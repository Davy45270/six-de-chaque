// Cherche une graine dont la partie à deux (« premier coup légal ») finit par blocage, et rend la sauvegarde
// d'export arrêtée juste avant la dernière série de passes. Écrite dans tests/fixtures/blocked.json par
// `WRITE_BLOCKED=1 npx vitest run tests/blocked-fixture.test.ts`.
import { createGame, getLegalMoves, stateHash, submit, validateAction } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, Session } from '@six-de-chaque/engine';

export const BLOCKED_CONFIG: GameConfig = { players: [{ id: 'toi', name: 'Toi', type: 'human' }, { id: 'ordi', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner' }] };

function firstLegal(session: Session): GameAction {
    const s = session.state;
    const p = s.players[s.currentPlayerIndex];
    if (!p) throw new Error('joueur courant');
    const base = { actorId: p.id, expectedTurn: s.turnNumber, actionId: `a-${s.turnNumber}` };
    const move = getLegalMoves(s, p.id, 1)[0];
    if (move) return { ...base, type: 'PLACE', placements: move.placements };
    if (validateAction(s, { ...base, type: 'PASS' }).ok) return { ...base, type: 'PASS' };
    return { ...base, type: 'EXCHANGE', tileIds: p.hand.slice(0, 1) };
}

export function findBlockedSave(maxSeeds = 10_000): { seed: string; json: string } | null {
    for (let i = 0; i < maxSeeds; i++) {
        const seed = `bloc-${i}`;
        let session: Session = { state: createGame(BLOCKED_CONFIG, seed), events: [] };
        const history: Session[] = [session];
        while (session.state.phase !== 'finished') {
            const { session: next, result } = submit(session, firstLegal(session));
            if (!result.ok) throw new Error(result.error.detail);
            session = next;
            history.push(session);
        }
        if (session.state.endReason !== 'blocked') continue;
        let cut = session.events.length;
        while (cut > 0 && session.events[cut - 1]?.action.type === 'PASS') cut--;
        const kept = history[cut] as Session;
        const snapshot = kept.state;
        const json = JSON.stringify({ format: 'six-de-chaque-save', version: 1, config: BLOCKED_CONFIG, seed, snapshot, events: kept.events, checksum: stateHash(snapshot) });
        return { seed, json };
    }
    return null;
}
