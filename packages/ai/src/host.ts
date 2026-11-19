// Hôte de recherche (côté Worker) : découpe la décision en tranches de nœuds, s'arrête sur CANCEL,
// garde un cache LRU de 64 décisions par empreinte de partie + joueur + niveau + type de demande + budget.
import { decide } from './policies';
import type { AiDecision } from './policies';
import type { AiRequest, FromWorker, ToWorker } from './protocol';

const CACHE_SIZE = 64;

function malformed(m: AiRequest): string | null {
    const v = m.view as unknown as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || !Array.isArray(v.players) || typeof v.board !== 'object' || v.board === null || typeof v.tilesById !== 'object') return 'vue de partie invalide';
    if (!Array.isArray(m.hand)) return 'main invalide';
    return null;
}

export function createAiHost(post: (m: FromWorker) => void, schedule: (fn: () => void) => void, sliceNodes = 256): (m: ToWorker) => void {
    const cache = new Map<string, AiDecision>();
    const cancelled = new Set<string>();
    return (m: ToWorker) => {
        if (m.type === 'CANCEL') { cancelled.add(m.requestId); return; }
        const bad = malformed(m);
        if (bad) { post({ type: 'ERROR', requestId: m.requestId, message: bad }); return; }
        const key = `${m.gameHash}|${m.playerId}|${m.level}|${m.type}|${m.budgetNodes}|${m.passLegal}`;
        const hit = cache.get(key);
        if (hit) {
            cache.delete(key); cache.set(key, hit);
            post({ type: 'RESULT', requestId: m.requestId, gameHash: m.gameHash, decision: hit });
            return;
        }
        let it: ReturnType<typeof decide>;
        try { it = decide(m.view, m.hand, m.playerId, m.level, m.budgetNodes, m.view.turnNumber, m.passLegal); } catch (error) {
            post({ type: 'ERROR', requestId: m.requestId, message: String(error) }); return;
        }
        const step = (): void => {
            if (cancelled.delete(m.requestId)) return;
            try {
                let done = 0;
                while (done < sliceNodes) {
                    const r = it.next();
                    if (r.done) {
                        cache.delete(key);
                        cache.set(key, r.value);
                        if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
                        post({ type: 'RESULT', requestId: m.requestId, gameHash: m.gameHash, decision: r.value });
                        return;
                    }
                    done += Math.max(1, r.value);
                }
            } catch (error) {
                post({ type: 'ERROR', requestId: m.requestId, message: error instanceof Error ? error.message : String(error) });
                return;
            }
            schedule(step);
        };
        schedule(step);
    };
}
