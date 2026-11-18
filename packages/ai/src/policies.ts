// Politiques de l'ordinateur : il ne voit que la projection publique et sa propre main. Débutant : tirage pondéré
// parmi les coups légaux ; intermédiaire : score immédiat moins 4 points par ligne de cinq laissée ouverte.
// La décision est un itérateur : chaque `yield` rend le nombre de nœuds évalués depuis le précédent (annulation).
import { canonicalJson, fnv1a64, getLegalMoves, randomInt, seedToState } from '@six-de-chaque/engine';
import type { AiLevel, GameAction, GameState, Move, PublicGameState, Tile, TileId } from '@six-de-chaque/engine';
import { calculateScore } from '@six-de-chaque/engine';

export interface AiDecision { action: GameAction; explanation: string; evaluatedNodes: number; seed: string }
export const OPEN_FIVE_PENALTY = 4;
const SLICE = 64;

/** État minimal reconstruit depuis la projection : la main des autres et la réserve restent inconnues. */
function pseudoState(view: PublicGameState, hand: readonly TileId[], playerId: string): GameState {
    return {
        ...view, seed: '-', rngState: [0, 0, 0, 0], bag: [],
        players: view.players.map(({ handCount: _n, hand: _h, ...p }) => ({ ...p, hand: p.id === playerId ? [...hand] : [] }))
    };
}

/** Lignes de cinq créées ou prolongées par le coup et qu'une case libre à un bout permettrait de compléter. */
export function openFives(view: Pick<PublicGameState, 'board'>, move: Move): number {
    const after = new Set([...Object.keys(view.board), ...move.placements.map(p => `${p.x}:${p.y}`)]);
    return calculateScore(view.board, move.placements).segments.filter(s => {
        if (s.length !== 5) return false;
        const [dx, dy] = s.axis === 'h' ? [1, 0] : [0, 1];
        return !after.has(`${s.startX - dx}:${s.startY - dy}`) || !after.has(`${s.endX + dx}:${s.endY + dy}`);
    }).length;
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
    const moves = getLegalMoves(pseudoState(view, hand, playerId), playerId);
    if (moves.length === 0) {
        if (passLegal || view.bagCount === 0) return { action: { ...base, type: 'PASS' }, explanation: 'Aucune pose possible : je passe.', evaluatedNodes: 0, seed };
        const tileIds = exchangeChoice(tiles, view.bagCount);
        return { action: { ...base, type: 'EXCHANGE', tileIds }, explanation: `Aucune pose possible : j’échange ${tileIds.length} tuile(s).`, evaluatedNodes: 0, seed };
    }
    const budget = Math.max(1, budgetNodes);
    const values: Array<{ move: Move; value: number }> = [];
    let pending = 0;
    for (const move of moves) {
        if (values.length >= budget) break;
        values.push({ move, value: level === 'beginner' ? 1 + 0.2 * move.score : move.score - OPEN_FIVE_PENALTY * openFives(view, move) });
        if (++pending >= SLICE) { yield pending; pending = 0; }
    }
    if (pending) yield pending;
    let chosen: Move;
    if (level === 'beginner') {
        const scale = 10;
        const weights = values.map(v => Math.round(v.value * scale));
        const total = weights.reduce((a, b) => a + b, 0);
        const [draw] = randomInt(total, seedToState(seed));
        let acc = 0;
        let index = weights.findIndex(w => (acc += w) > draw);
        if (index < 0) index = 0;
        chosen = (values[index] as { move: Move }).move;
    } else {
        const best = values.reduce((a, b) => (b.value > a.value || (b.value === a.value && b.move.key < a.move.key) ? b : a));
        chosen = best.move;
    }
    const opens = openFives(view, chosen);
    const explanation = `${chosen.placements.length} tuile(s) pour ${chosen.score} point(s)${opens ? `, ${opens} ligne(s) de cinq ouverte(s)` : ''}.`;
    return { action: { ...base, type: 'PLACE', placements: chosen.placements.map(p => ({ ...p })) }, explanation, evaluatedNodes: values.length, seed };
}

/** Joue la décision jusqu'au bout (tests, outils). */
export function decideNow(...args: Parameters<typeof decide>): AiDecision {
    const it = decide(...args);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
}
