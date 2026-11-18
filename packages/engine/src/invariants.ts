// Invariants d'un état : conservation des 108 tuiles, mains, joueurs, indices.
import { ALL_TILES, HAND_SIZE, TILE_COUNT } from './tiles';
import { parseKey } from './lines';
import type { GameState } from './types';

export function checkInvariants(s: GameState): string[] {
    const errors: string[] = [];
    const seen = new Map<string, number>();
    const count = (id: string): void => { seen.set(id, (seen.get(id) ?? 0) + 1); };
    for (const id of Object.values(s.board)) count(id);
    for (const p of s.players) p.hand.forEach(count);
    s.bag.forEach(count);
    const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    if (duplicates.length) errors.push(`tuiles en double : ${duplicates.join(', ')}`);
    if (seen.size !== TILE_COUNT) errors.push(`${seen.size} tuiles au lieu de ${TILE_COUNT}`);
    const unknown = [...seen.keys()].filter(id => !(id in s.tilesById));
    if (unknown.length) errors.push(`tuiles inconnues : ${unknown.join(', ')}`);
    const tilesOk = Object.keys(s.tilesById).length === TILE_COUNT
        && ALL_TILES.every(t => { const u = s.tilesById[t.id]; return u?.id === t.id && u.color === t.color && u.shape === t.shape; });
    if (!tilesOk) errors.push('dictionnaire des tuiles altéré');
    if (s.players.length < 2 || s.players.length > 4) errors.push(`${s.players.length} joueurs`);
    if (new Set(s.players.map(p => p.id)).size !== s.players.length) errors.push('identifiants de joueurs en double');
    for (const p of s.players) if (p.hand.length > HAND_SIZE) errors.push(`main de ${p.hand.length} pour ${p.id}`);
    if (!Number.isInteger(s.currentPlayerIndex) || s.currentPlayerIndex < 0 || s.currentPlayerIndex >= s.players.length) errors.push('joueur courant hors bornes');
    for (const key of Object.keys(s.board)) {
        const { x, y } = parseKey(key);
        if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > s.config.coordinateLimit || Math.abs(y) > s.config.coordinateLimit) errors.push(`case invalide ${key}`);
    }
    if (s.phase === 'opening' && Object.keys(s.board).length > 0) errors.push('plateau non vide en ouverture');
    return errors;
}
