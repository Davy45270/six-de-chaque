// Point d'entrée du Web Worker : seul fichier du paquet autorisé à toucher `self`.
import { createAiHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const handle = createAiHost(m => { scope.postMessage(m); }, fn => { setTimeout(fn, 0); });
scope.onmessage = e => { handle(e.data); };
