import { boardLookup, calculateScore, cellKey, isValidLine, parseKey, STEP } from '@six-de-chaque/engine';
import type { GameState, Move, Tile } from '@six-de-chaque/engine';

/** Points par couleur ou glyphe distinct conservé, par case jouable et par cinq ouvert. */
export const ADVANCED_DIVERSITY_WEIGHT = 0.35;
export const ADVANCED_MOBILITY_WEIGHT = 0.2;
export const OPEN_FIVE_PENALTY = 4;

/** Une ligne de cinq touchée par le coup est ouverte si un bout est libre et dans les limites. */
export function openFives(view: Pick<GameState, 'board'> & Partial<Pick<GameState, 'config'>>, move: Move): number {
    const at = boardLookup(view.board, new Map(move.placements.map(p => [cellKey(p.x, p.y), p.tileId])));
    const bound = view.config?.coordinateLimit ?? Infinity;
    const open = (x: number, y: number): boolean => Math.abs(x) <= bound && Math.abs(y) <= bound && at(x, y) === undefined;
    return calculateScore(view.board, move.placements).segments.filter(s => {
        if (s.length !== 5) return false;
        const [dx, dy] = STEP[s.axis];
        return open(s.startX - dx, s.startY - dy) || open(s.endX + dx, s.endY + dy);
    }).length;
}

export function handDiversity(tiles: readonly Tile[]): number {
    return new Set(tiles.map(t => t.color)).size + new Set(tiles.map(t => t.shape)).size;
}

const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export function advancedEvaluator(view: Pick<GameState, 'board' | 'tilesById' | 'config'>, hand: readonly Tile[]) {
    const before = boardLookup(view.board);
    const bound = view.config.coordinateLimit;
    const inside = (x: number, y: number): boolean => Math.abs(x) <= bound && Math.abs(y) <= bound;
    // Un bit par tuile de la main. Les cases qui ne changent pas réutilisent leur masque.
    function mask(at: typeof before, x: number, y: number): number {
        const along = (dx: number, dy: number): Tile[] => {
            const line: Tile[] = [];
            for (let cx = x + dx, cy = y + dy; ; cx += dx, cy += dy) {
                const id = at(cx, cy);
                if (id === undefined) break;
                const tile = view.tilesById[id];
                if (tile) line.push(tile);
            }
            return line;
        };
        const horizontal = [...along(-1, 0), ...along(1, 0)];
        const vertical = [...along(0, -1), ...along(0, 1)];
        return hand.reduce((bits, tile, i) => isValidLine([...horizontal, tile]) && isValidLine([...vertical, tile]) ? bits | (1 << i) : bits, 0);
    }

    const frontier = new Map<string, number>();
    for (const key of Object.keys(view.board)) {
        const { x, y } = parseKey(key);
        for (const [dx, dy] of directions) {
            const cx = x + dx, cy = y + dy, cell = cellKey(cx, cy);
            if (inside(cx, cy) && before(cx, cy) === undefined && !frontier.has(cell)) frontier.set(cell, mask(before, cx, cy));
        }
    }

    return (move: Move): number => {
        const added = new Map(move.placements.map(p => [cellKey(p.x, p.y), p.tileId]));
        const used = new Set(added.values());
        const remaining = hand.filter(t => !used.has(t.id));
        const bits = hand.reduce((value, t, i) => used.has(t.id) ? value : value | (1 << i), 0);
        let mobility = 0;
        for (const [key, playable] of frontier) if (!added.has(key) && (playable & bits)) mobility++;
        if (bits) {
            const at = boardLookup(view.board, added);
            const changed = new Set<string>();
            for (const p of move.placements) {
                for (const [dx, dy] of directions) {
                    let x = p.x + dx, y = p.y + dy;
                    while (at(x, y) !== undefined) { x += dx; y += dy; }
                    const key = cellKey(x, y);
                    if (!inside(x, y) || changed.has(key)) continue;
                    changed.add(key);
                    if ((frontier.get(key) ?? 0) & bits) mobility--;
                    if (mask(at, x, y) & bits) mobility++;
                }
            }
        }
        return move.score + ADVANCED_DIVERSITY_WEIGHT * handDiversity(remaining)
            + ADVANCED_MOBILITY_WEIGHT * mobility - OPEN_FIVE_PENALTY * openFives(view, move);
    };
}
