// Oracle de force brute pour les petits plateaux : toute suite ordonnée de tuiles de la main (copies identiques
// confondues), chaque axe, chaque case de départ de la boîte englobante élargie de 6, posée sur les cases vides
// successives de l'axe ; on garde ce que la validation accepte.
import { moveKey } from '../src/moves';
import { cellKey } from '../src/lines';
import { validateAction } from '../src/validate';
import type { GameState, Placement, TileId } from '../src/types';

export function bruteForceMoves(state: GameState, playerId: string): Set<string> {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return new Set();
    const s = { ...state, currentPlayerIndex: state.players.indexOf(player) };
    const keys = Object.keys(state.board).map(k => k.split(':').map(Number) as [number, number]);
    const xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
    const [x0, x1, y0, y1] = keys.length ? [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...ys) - 6, Math.max(...ys) + 6] : [-6, 6, -6, 6];
    const sequences: TileId[][] = [];
    const walk = (seq: TileId[]): void => {
        if (seq.length) sequences.push(seq);
        const tried = new Set<string>();
        for (const id of player.hand) {
            const t = state.tilesById[id];
            const attr = `${t?.color}:${t?.shape}`;
            if (seq.includes(id) || tried.has(attr)) continue;
            tried.add(attr);
            walk([...seq, id]);
        }
    };
    walk([]);
    const out = new Set<string>();
    for (const seq of sequences) {
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                const placements: Placement[] = [];
                let cx = x, cy = y;
                for (const id of seq) {
                    while (state.board[cellKey(cx, cy)] !== undefined) { cx += dx; cy += dy; }
                    placements.push({ tileId: id, x: cx, y: cy });
                    cx += dx; cy += dy;
                }
                if (validateAction(s, { type: 'PLACE', actorId: playerId, expectedTurn: s.turnNumber, actionId: 'o', placements }).ok) out.add(moveKey(state, placements));
            }
        }
    }
    return out;
}
