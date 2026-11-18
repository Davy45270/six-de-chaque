// Messages entre l'application et le Worker de l'ordinateur.
import type { AiLevel, PublicGameState, TileId } from '@six-de-chaque/engine';
import type { AiDecision } from './policies';

export type AiRequest = { type: 'REQUEST_MOVES' | 'REQUEST_HINT'; requestId: string; gameHash: string; view: PublicGameState; hand: TileId[];
    playerId: string; level: AiLevel; budgetNodes: number; passLegal?: boolean };
export type ToWorker = AiRequest | { type: 'CANCEL'; requestId: string };
export type FromWorker = { type: 'RESULT'; requestId: string; gameHash: string; decision: AiDecision } | { type: 'ERROR'; requestId: string; message: string };
