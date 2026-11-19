import { applyAction, FINAL_BONUS, seedToState, shuffle } from '@six-de-chaque/engine';
import { scanLegalMoves } from '@six-de-chaque/engine/internal/move-scan';
import type { GameState, Move, PlaceAction, PublicGameState, RngState, TileId } from '@six-de-chaque/engine';

/** Plusieurs répartitions communes aux candidats pour comparer leurs suites à tirage égal. */
const SAMPLES = 4;
export const EXPERT_CANDIDATES = 4;
const REPLY_LIMIT = 12;
const REPLY_WEIGHT = 0.75;

export function sampleHiddenState(view: PublicGameState, hand: readonly TileId[], playerId: string, rng: RngState): GameState {
    const { bagCount, players, ...publicState } = view;
    const visible = new Set([...hand, ...Object.values(view.board)]);
    const [hidden, rngState] = shuffle(Object.keys(view.tilesById).filter(id => !visible.has(id)).sort(), rng);
    let offset = 0;
    const sampledPlayers = players.map(({ handCount, hand: _hidden, ...p }) => {
        if (p.id === playerId) return { ...p, hand: [...hand] };
        const sampled = hidden.slice(offset, offset + handCount);
        offset += handCount;
        return { ...p, hand: sampled };
    });
    if (offset + bagCount > hidden.length) throw new Error('Nombre de tuiles cachées incohérent.');
    return { ...publicState, seed: '-', rngState, players: sampledPlayers, bag: hidden.slice(offset, offset + bagCount) };
}

export interface RankedMove { move: Move; value: number }

export function* simulateReplies(view: PublicGameState, hand: readonly TileId[], base: Omit<PlaceAction, 'type' | 'placements'>,
    candidates: readonly RankedMove[], seed: string, budget: number): Generator<number, Move, void> {
    const values = candidates.map(c => c.value);
    // Chaque essai réserve un nœud pour la pose simulée et le même quota de réponses à chaque candidat.
    const rounds = Math.min(SAMPLES, Math.floor(budget / (2 * candidates.length)));
    const replyLimit = Math.min(REPLY_LIMIT, Math.floor(budget / Math.max(1, rounds * candidates.length)) - 1);
    for (let sample = 0; sample < rounds; sample++) {
        const simulated = sampleHiddenState(view, hand, base.actorId, seedToState(`${seed}:${sample}`));
        for (const [i, candidate] of candidates.entries()) {
            const played = applyAction(simulated, { ...base, type: 'PLACE', placements: candidate.move.placements });
            if (!played.ok) throw new Error('Pose simulée refusée.');
            const opponent = played.state.players[played.state.currentPlayerIndex];
            yield 1;
            let replyScore = 0;
            if (played.state.phase !== 'finished' && opponent) {
                const replies = scanLegalMoves(played.state, opponent.id);
                for (let j = 0; j < replyLimit; j++) {
                    const node = replies.next();
                    if (node.done) break;
                    yield 1;
                    const move = node.value;
                    if (!move) continue;
                    const bonus = played.state.bag.length === 0 && move.placements.length === opponent.hand.length ? FINAL_BONUS : 0;
                    replyScore = Math.max(replyScore, move.score + bonus);
                }
            }
            values[i] = (values[i] ?? 0) + (played.event.finalBonus - REPLY_WEIGHT * replyScore) / rounds;
        }
    }
    const best = values.reduce((winner, value, i) => value > (values[winner] ?? -Infinity) ? i : winner, 0);
    return (candidates[best] as RankedMove).move;
}
