// Textes des coups pour l'historique et la région « aria-live ». Un échange ne dit jamais quelles tuiles.
import { tileName } from '@six-de-chaque/renderer-pixi';
import type { GameConfig, GameEvent, Tile, TileId } from '@six-de-chaque/engine';

export const playerName = (config: GameConfig, id: string): string => config.players.find(p => p.id === id)?.name ?? id;
export function describeEvent(e: GameEvent, config: GameConfig, tiles: Readonly<Record<TileId, Tile>>): string {
    const who = playerName(config, e.action.actorId);
    // Le nom par défaut du joueur humain est « Toi » : « Toi passe » se lit mal, on lui parle à la deuxième personne.
    const you = who.trim().toLowerCase() === 'toi';
    switch (e.action.type) {
        case 'PLACE': {
            const list = e.action.placements.map(p => { const t = tiles[p.tileId]; return `${t ? tileName(t.color, t.shape).replace(/ \(.*\)$/, '') : '?'} en ${p.x}, ${p.y}`; });
            const pts = e.score?.total ?? 0;
            return `${who} : ${list.join(', ')} — ${pts} point${pts > 1 ? 's' : ''}${e.finalBonus ? `, +${e.finalBonus} pour avoir vidé sa main` : ''}.`;
        }
        case 'EXCHANGE': {
            const n = e.action.tileIds.length;
            return `${you ? 'Tu échanges' : `${who} échange`} ${n} tuile${n > 1 ? 's' : ''}.`;
        }
        case 'PASS': return you ? 'Tu passes.' : `${who} passe.`;
    }
}
