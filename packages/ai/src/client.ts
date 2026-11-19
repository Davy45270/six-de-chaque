// Client côté application : une seule demande active, avec un délai de garde.
import type { AiDecision } from './policies';
import type { AiRequest, FromWorker, ToWorker } from './protocol';

type WorkerLike = { postMessage(m: ToWorker): void; addEventListener(type: 'message', fn: (e: { data: FromWorker }) => void): void };
export type AiResponse = { status: 'ok'; decision: AiDecision }
    | { status: 'error'; message: string }
    | { status: 'timeout' | 'stale' | 'cancelled' };

interface Pending {
    id: string;
    gameHash: string;
    resolve: (response: AiResponse) => void;
    currentHash: () => string;
    timer: ReturnType<typeof setTimeout>;
}

let counter = 0;

export class AiClient {
    private pending: Pending | null = null;

    constructor(private readonly worker: WorkerLike, private readonly timeoutMs = 8_000) {
        worker.addEventListener('message', e => { this.receive(e.data); });
    }

    request(m: Omit<AiRequest, 'requestId'>, currentHash: () => string): Promise<AiResponse> {
        this.cancel();
        const id = `req-${++counter}`;
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                if (this.pending?.id === id) this.finish({ status: 'timeout' }, true);
            }, this.timeoutMs);
            this.pending = { id, gameHash: m.gameHash, resolve, currentHash, timer };
            try {
                this.worker.postMessage({ ...m, requestId: id });
            } catch (error) {
                this.finish({ status: 'error', message: String(error) });
            }
        });
    }

    cancel(): void {
        this.finish({ status: 'cancelled' }, true);
    }

    private finish(response: AiResponse, cancel = false): void {
        const p = this.pending;
        if (!p) return;
        this.pending = null;
        clearTimeout(p.timer);
        if (cancel) {
            try {
                this.worker.postMessage({ type: 'CANCEL', requestId: p.id });
            } catch {
                // Le transport peut déjà être hors service.
            }
        }
        p.resolve(response);
    }

    private receive(m: FromWorker): void {
        const p = this.pending;
        if (!p || p.id !== m.requestId) return;
        if (p.gameHash !== p.currentHash() || (m.type === 'RESULT' && m.gameHash !== p.gameHash)) {
            this.finish({ status: 'stale' });
        } else if (m.type === 'ERROR') {
            this.finish({ status: 'error', message: m.message });
        } else {
            this.finish({ status: 'ok', decision: m.decision });
        }
    }
}
