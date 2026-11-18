// Client côté application : une demande à la fois ; une réponse dont l'empreinte de partie a changé est ignorée.
import type { AiDecision } from './policies';
import type { AiRequest, FromWorker, ToWorker } from './protocol';

type WorkerLike = { postMessage(m: ToWorker): void; addEventListener(type: 'message', fn: (e: { data: FromWorker }) => void): void };
let counter = 0;

export class AiClient {
    private pending: { id: string; resolve: (d: AiDecision | null) => void; currentHash: () => string } | null = null;
    constructor(private readonly worker: WorkerLike) {
        worker.addEventListener('message', e => { this.receive(e.data); });
    }
    request(m: Omit<AiRequest, 'requestId'>, currentHash: () => string): Promise<AiDecision | null> {
        this.cancel();
        const id = `req-${++counter}`;
        return new Promise(resolve => {
            this.pending = { id, resolve, currentHash };
            this.worker.postMessage({ ...m, requestId: id });
        });
    }
    cancel(): void {
        const p = this.pending;
        if (!p) return;
        this.pending = null;
        this.worker.postMessage({ type: 'CANCEL', requestId: p.id });
        p.resolve(null);
    }
    private receive(m: FromWorker): void {
        const p = this.pending;
        if (p?.id !== m.requestId) return;
        this.pending = null;
        if (m.type === 'ERROR') { p.resolve(null); return; }
        p.resolve(m.gameHash === p.currentHash() ? m.decision : null);
    }
}
