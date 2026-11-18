// Transitions pures : une action validée produit un nouvel état et un événement chaîné ; un refus ne change rien.
import { canonicalJson, fnv1a64 } from './hash';
import { cellKey } from './lines';
import { shuffle } from './rng';
import { calculateScore } from './score';
import type { ScoreBreakdown } from './score';
import { HAND_SIZE } from './tiles';
import { validateAction } from './validate';
import type { Rejection } from './validate';
import type { GameAction, GameState, PlayerState } from './types';

export const FINAL_BONUS = 6;
export const GENESIS_HASH = '0'.repeat(16);
export interface GameEvent {
    seq: number; actionId: string; action: GameAction; score: ScoreBreakdown | null;
    finalBonus: number; prevHash: string; stateHash: string; hash: string;
}
export type Transition = { ok: true; state: GameState; event: GameEvent } | { ok: false; error: Rejection; state: GameState };

export const stateHash = (state: GameState): string => fnv1a64(canonicalJson(state));
export const eventHash = (prevHash: string, e: Pick<GameEvent, 'seq' | 'action' | 'score' | 'stateHash'>): string =>
    fnv1a64(prevHash + canonicalJson({ seq: e.seq, action: e.action, score: e.score, stateHash: e.stateHash }));

export function applyAction(state: GameState, action: GameAction, prevHash: string = GENESIS_HASH): Transition {
    const verdict = validateAction(state, action);
    if (!verdict.ok) return { ok: false, error: verdict, state };
    const index = state.currentPlayerIndex;
    const player = state.players[index] as PlayerState;
    let next: GameState;
    let score: ScoreBreakdown | null = null;
    let finalBonus = 0;
    const advance = (s: GameState): GameState => ({ ...s, turnNumber: state.turnNumber + 1, currentPlayerIndex: (index + 1) % state.players.length });
    const withPlayer = (s: GameState, p: PlayerState): GameState => ({ ...s, players: s.players.map((q, i) => (i === index ? p : q)) });
    switch (action.type) {
        case 'PLACE': {
            score = calculateScore(state.board, action.placements);
            const placedIds = new Set(action.placements.map(p => p.tileId));
            const board = { ...state.board };
            for (const p of action.placements) board[cellKey(p.x, p.y)] = p.tileId;
            const kept = player.hand.filter(id => !placedIds.has(id));
            const drawn = state.bag.slice(0, Math.max(0, HAND_SIZE - kept.length));
            const hand = [...kept, ...drawn];
            const out = hand.length === 0;
            finalBonus = out ? FINAL_BONUS : 0;
            const updated = { ...player, hand, score: player.score + score.total + finalBonus };
            next = withPlayer({ ...state, board, bag: state.bag.slice(drawn.length), phase: 'playing', consecutivePasses: 0 }, updated);
            next = out ? { ...next, turnNumber: state.turnNumber + 1, phase: 'finished', endReason: 'out' } : advance(next);
            break;
        }
        case 'EXCHANGE': {
            // Tirer d'abord, puis remettre les tuiles rendues et mélanger : on ne repioche jamais ce qu'on rend.
            const n = action.tileIds.length;
            const returned = new Set(action.tileIds);
            const drawn = state.bag.slice(0, n);
            const [bag, rngState] = shuffle([...state.bag.slice(n), ...action.tileIds], state.rngState);
            const updated = { ...player, hand: [...player.hand.filter(id => !returned.has(id)), ...drawn] };
            next = advance(withPlayer({ ...state, bag, rngState, consecutivePasses: 0 }, updated));
            break;
        }
        case 'PASS': {
            const passes = state.consecutivePasses + 1;
            next = { ...state, consecutivePasses: passes };
            next = passes >= state.players.length
                ? { ...next, turnNumber: state.turnNumber + 1, phase: 'finished', endReason: 'blocked' }
                : advance(next);
            break;
        }
    }
    const seq = state.turnNumber;
    const sh = stateHash(next);
    const event: GameEvent = { seq, actionId: action.actionId, action: structuredCloneAction(action), score, finalBonus, prevHash, stateHash: sh, hash: '' };
    event.hash = eventHash(prevHash, event);
    return { ok: true, state: next, event };
}

function structuredCloneAction(action: GameAction): GameAction {
    switch (action.type) {
        case 'PLACE': return { ...action, placements: action.placements.map(p => ({ ...p })) };
        case 'EXCHANGE': return { ...action, tileIds: [...action.tileIds] };
        case 'PASS': return { ...action };
    }
}

/** Joueurs à égalité au plus haut score (victoire partagée). */
export function winners(state: GameState): string[] {
    const best = Math.max(...state.players.map(p => p.score));
    return state.players.filter(p => p.score === best).map(p => p.id);
}
