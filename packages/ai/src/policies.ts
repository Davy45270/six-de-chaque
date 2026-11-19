// Décision à partir de la vue publique. Chaque suspension indique le nombre de nœuds depuis la précédente.
import { canonicalJson, fnv1a64, getLegalMoves, isDeadPosition, randomInt, seedToState } from '@six-de-chaque/engine';
import type { AiLevel, GameAction, GameState, Move, PublicGameState, Tile, TileId } from '@six-de-chaque/engine';
import { advancedEvaluator, OPEN_FIVE_PENALTY, openFives } from './heuristics';
import { EXPERT_CANDIDATES, simulateReplies } from './expert';
import type { RankedMove } from './expert';

export { ADVANCED_DIVERSITY_WEIGHT, ADVANCED_MOBILITY_WEIGHT, OPEN_FIVE_PENALTY, openFives } from './heuristics';
export interface AiDecision { move: GameAction; explanation: string; evaluatedNodes: number; seed: string }
/** Au plus deux points disponibles et deux combinaisons couleur-glyphe dans la main. */
export const EXCHANGE_SCORE_THRESHOLD = 2;
export const EXCHANGE_DIVERSITY_THRESHOLD = 2;
const SLICE = 64;

/** État minimal reconstruit depuis la projection : la main des autres et la réserve restent inconnues. */
function pseudoState(view: PublicGameState, hand: readonly TileId[], playerId: string): GameState {
    return {
        ...view, seed: '-', rngState: [0, 0, 0, 0], bag: [],
        players: view.players.map(({ handCount: _n, hand: _h, ...p }) => ({ ...p, hand: p.id === playerId ? [...hand] : [] }))
    };
}

function exchangeChoice(tiles: readonly Tile[], bagCount: number): TileId[] {
    // Garder le plus grand groupe compatible (une tuile par attribut), rendre le reste.
    let keep: Tile[] = [];
    for (let v = 0; v < 6; v++) {
        for (const pick of [(t: Tile) => t.color === v, (t: Tile) => t.shape === v]) {
            const seen = new Set<string>();
            const group = tiles.filter(t => pick(t) && !seen.has(`${t.color}:${t.shape}`) && seen.add(`${t.color}:${t.shape}`));
            if (group.length > keep.length) keep = group;
        }
    }
    const kept = new Set(keep.map(t => t.id));
    let give = tiles.filter(t => !kept.has(t.id)).map(t => t.id);
    if (give.length === 0) give = tiles.slice(0, 1).map(t => t.id);
    return give.slice(0, Math.max(1, Math.min(bagCount, give.length)));
}

export function* decide(view: PublicGameState, hand: readonly TileId[], playerId: string, level: AiLevel, budgetNodes: number,
    expectedTurn: number, passLegal = false): Generator<number, AiDecision, void> {
    const seed = fnv1a64(canonicalJson(view) + playerId);
    const base = { actorId: playerId, expectedTurn, actionId: `ordi-${expectedTurn}-${seed.slice(0, 8)}` };
    const tiles = hand.map(id => view.tilesById[id]).filter((t): t is Tile => t !== undefined);
    if (tiles.length !== hand.length) throw new Error('main inconnue');
    const state = pseudoState(view, hand, playerId);
    const budget = Number.isFinite(budgetNodes) ? Math.max(0, Math.floor(budgetNodes)) : 0;
    const rankingBudget = level === 'expert' && budget >= 16 ? budget - Math.floor(budget / 2) : budget;
    // Une pose de secours reste disponible pour une demande à budget nul.
    const moves = getLegalMoves(state, playerId, Math.max(1, rankingBudget));
    if (moves.length === 0) {
        // Toutes les tuiles hors plateau constituent l'union des mains adverses et de la réserve.
        const onBoard = new Set(Object.values(view.board));
        const dead = () => isDeadPosition({ ...state, bag: Object.keys(view.tilesById).filter(id => !onBoard.has(id)) });
        if (passLegal || view.bagCount === 0 || dead()) {
            return { move: { ...base, type: 'PASS' }, explanation: 'Aucune pose possible, je passe.', evaluatedNodes: 0, seed };
        }
        const tileIds = exchangeChoice(tiles, view.bagCount);
        return { move: { ...base, type: 'EXCHANGE', tileIds }, explanation: `Aucune pose possible, j’échange ${tileIds.length} tuile(s).`, evaluatedNodes: 0, seed };
    }
    const advance = level === 'advanced' || level === 'expert' ? advancedEvaluator(view, tiles) : null;
    const values: RankedMove[] = [];
    let pending = 0;
    for (const move of moves.slice(0, rankingBudget)) {
        const value = advance ? advance(move) : level === 'beginner' ? 10 + 2 * move.score : move.score - OPEN_FIVE_PENALTY * openFives(view, move);
        values.push({ move, value });
        if (++pending >= SLICE) { yield pending; pending = 0; }
    }
    if (pending) yield pending;
    let evaluatedNodes = values.length;
    let chosen = moves[0] as Move;
    const diverseKinds = new Set(tiles.map(t => t.color * 6 + t.shape)).size;
    if (level !== 'beginner' && view.phase === 'playing' && view.bagCount > 0 && diverseKinds <= EXCHANGE_DIVERSITY_THRESHOLD
        && moves.length < rankingBudget && values.length > 0 && moves.every(m => m.score <= EXCHANGE_SCORE_THRESHOLD)) {
        const tileIds = exchangeChoice(tiles, tiles.length);
        if (tileIds.length <= view.bagCount) {
            return { move: { ...base, type: 'EXCHANGE', tileIds }, explanation: `La pose rapporte peu, j’échange ${tileIds.length} tuile(s).`, evaluatedNodes, seed };
        }
    }
    if (level === 'beginner' && values.length) {
        const total = values.reduce((a, b) => a + b.value, 0);
        const [draw] = randomInt(total, seedToState(seed));
        let acc = 0;
        chosen = values.find(v => (acc += v.value) > draw)?.move ?? chosen;
    } else if (values.length) {
        values.sort((a, b) => b.value - a.value || (a.move.key < b.move.key ? -1 : 1));
        chosen = (values[0] as RankedMove).move;
        if (level === 'expert') {
            const search = simulateReplies(view, hand, base, values.slice(0, EXPERT_CANDIDATES), seed, budget - evaluatedNodes);
            let result = search.next();
            while (!result.done) {
                evaluatedNodes += result.value;
                yield result.value;
                result = search.next();
            }
            chosen = result.value;
        }
    }
    const opens = openFives(view, chosen);
    const explanation = `${chosen.placements.length} tuile(s) pour ${chosen.score} point(s)${opens ? `, ${opens} ligne(s) de cinq ouverte(s)` : ''}.`;
    return { move: { ...base, type: 'PLACE', placements: chosen.placements.map(p => ({ ...p })) }, explanation, evaluatedNodes, seed };
}

/** Joue la décision jusqu'au bout (tests, outils). */
export function decideNow(...args: Parameters<typeof decide>): AiDecision {
    const it = decide(...args);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
}
