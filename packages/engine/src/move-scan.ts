// Générateur de coups légaux : depuis chaque case frontière et chaque axe, recherche en profondeur qui pose une
// tuile de la main puis étend la ligne à gauche ou à droite sur la prochaine case vide. Élagage dès qu'une ligne
// devient invalide ; copies identiques traitées une fois par position ; validation finale ; dédoublonnage par clé.
import { cellKey, isValidLine, MAX_LINE, STEP } from './lines';
import type { Axis } from './lines';
import { validatePlacements } from './placement';
import { calculateScore } from './score';
import type { GameState, Placement, Tile, TileId } from './types';

export interface Move { placements: Placement[]; score: number; key: string }

export function moveKey(state: GameState, placements: readonly Placement[]): string {
    return placements.map(p => { const t = state.tilesById[p.tileId]; return `${p.x},${p.y},${t?.color ?? -1},${t?.shape ?? -1}`; }).sort().join(';');
}

function* frontier(state: GameState): Generator<{ x: number; y: number }, void, void> {
    const keys = Object.keys(state.board);
    if (keys.length === 0) yield { x: 0, y: 0 };
    const seen = new Set<string>();
    for (const key of keys) {
        const [x, y] = key.split(':').map(Number) as [number, number];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const k = cellKey(x + dx, y + dy);
            if (state.board[k] === undefined && !seen.has(k)) {
                seen.add(k);
                yield { x: x + dx, y: y + dy };
            }
        }
    }
}

/** Explore la main indiquée. Chaque suspension compte une pose candidate ou une case sans tuile compatible. */
export function* scanLegalMoves(state: GameState, playerId: string,
    accepts?: (placements: Placement[]) => boolean): Generator<Move | null, void, void> {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    const hand = player.hand;
    const isAccepted = accepts ?? (placements => validatePlacements(state, hand, placements).ok);
    const tiles = hand.map(id => state.tilesById[id]).filter((t): t is Tile => t !== undefined);
    const bound = state.config.coordinateLimit;
    const found = new Set<string>();
    const placed = new Map<string, TileId>();
    const at = (x: number, y: number): TileId | undefined => placed.get(cellKey(x, y)) ?? state.board[cellKey(x, y)];
    const occupied = (x: number, y: number): boolean => at(x, y) !== undefined;
    const tileAt = (x: number, y: number): Tile => state.tilesById[at(x, y) as TileId] as Tile;
    const used = new Set<TileId>();
    const record = (list: Placement[]): Move | null => {
        const key = moveKey(state, list);
        if (found.has(key) || !isAccepted(list)) return null;
        found.add(key);
        return { placements: list.map(p => ({ ...p })), score: calculateScore(state.board, list).total, key };
    };
    function* search(axis: Axis, list: Placement[]): Generator<Move | null, void, void> {
        if (list.length >= hand.length) return;
        const [dx, dy] = STEP[axis];
        const ends: Array<{ x: number; y: number }> = [];
        const first = list[0] as Placement;
        // Prochaine case vide de chaque côté de la ligne qui contient les tuiles posées.
        for (const dir of [-1, 1]) {
            let x = first.x, y = first.y;
            while (occupied(x, y)) { x += dir * dx; y += dir * dy; }
            ends.push({ x, y });
        }
        for (const cell of ends) {
            if (Math.abs(cell.x) > bound || Math.abs(cell.y) > bound) continue;
            yield* tryCell(axis, list, cell.x, cell.y);
        }
    }
    // Tuiles déjà alignées de part et d'autre d'une case, lues une fois par case et non une fois par tuile essayée.
    const run = (x: number, y: number, dx: number, dy: number): Tile[] => {
        const out: Tile[] = [];
        for (let cx = x + dx, cy = y + dy; occupied(cx, cy) && out.length <= MAX_LINE; cx += dx, cy += dy) out.push(tileAt(cx, cy));
        return out;
    };
    const fits = (line: Tile[], t: Tile): boolean => line.length < MAX_LINE && (line.length === 0 || isValidLine([...line, t]));
    function* tryCell(axis: Axis | null, list: Placement[], x: number, y: number): Generator<Move | null, void, void> {
        const h = [...run(x, y, -1, 0), ...run(x, y, 1, 0)];
        const v = [...run(x, y, 0, -1), ...run(x, y, 0, 1)];
        const tried = new Set<number>();
        let compatible = false;
        for (const t of tiles) {
            if (used.has(t.id) || tried.has(t.color * 6 + t.shape)) continue;
            tried.add(t.color * 6 + t.shape);
            if (!fits(h, t) || !fits(v, t)) continue;
            compatible = true;
            placed.set(cellKey(x, y), t.id);
            used.add(t.id);
            const next = [...list, { tileId: t.id, x, y }];
            yield record(next);
            if (axis) yield* search(axis, next);
            else { yield* search('h', next); yield* search('v', next); }
            placed.delete(cellKey(x, y));
            used.delete(t.id);
        }
        if (!compatible) yield null;
    }
    for (const cell of frontier(state)) {
        if (Math.abs(cell.x) > bound || Math.abs(cell.y) > bound) continue;
        yield* tryCell(null, [], cell.x, cell.y);
    }
}

export function findAnyLegalPlacement(state: GameState, playerId: string): Placement[] | null {
    for (const move of scanLegalMoves(state, playerId)) if (move) return move.placements;
    return null;
}

/**
 * Position morte : aucune tuile hors du plateau (mains et réserve) ne peut plus y être posée, même seule.
 * Un coup de plusieurs tuiles contient toujours une tuile posable seule (lignes héritées, contact), donc ce
 * contrôle suffit. Dans ce cas l'échange ne peut plus rien débloquer : la passe devient légale.
 */
export function* scanDeadPosition(state: GameState): Generator<Move | null, void, void> {
    const kinds = new Map<number, TileId>();
    for (const id of [...state.players.flatMap(p => p.hand), ...state.bag]) {
        const t = state.tilesById[id];
        if (t && !kinds.has(t.color * 6 + t.shape)) kinds.set(t.color * 6 + t.shape, id);
    }
    const probe = state.players[0];
    if (!probe) return;
    const pseudo: GameState = { ...state, players: [{ ...probe, hand: [...kinds.values()] }, ...state.players.slice(1)] };
    yield* scanLegalMoves(pseudo, probe.id);
}

export function isDeadPosition(state: GameState): boolean {
    for (const move of scanDeadPosition(state)) if (move) return false;
    return true;
}
