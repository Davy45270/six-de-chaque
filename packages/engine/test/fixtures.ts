// Fixtures de test : un état construit à la main. Avec `bagCount`, l'état est partiel (invariants violés, voulu).
import { DEFAULT_RULES } from '../src/create';
import { ALL_TILES, tileId, tilesRecord } from '../src/tiles';
import { cellKey } from '../src/lines';
import type { GameState, PlayerState } from '../src/types';

type Spec = [number, number, number?];
export interface FixtureSpec {
    board?: Array<[number, number, number, number, number?]>;
    hands: Spec[][];
    current?: number;
    phase?: GameState['phase'];
    bagCount?: number;
    turn?: number;
    types?: Array<PlayerState['type']>;
}
export function stateFrom(spec: FixtureSpec): GameState {
    const used = new Set<string>();
    const take = (color: number, shape: number, copy?: number): string => {
        const id = copy === undefined ? [0, 1, 2].map(c => tileId(color, shape, c)).find(t => !used.has(t)) : tileId(color, shape, copy);
        if (!id || used.has(id)) throw new Error(`fixture : tuile ${color}/${shape} indisponible`);
        used.add(id);
        return id;
    };
    const board: Record<string, string> = {};
    for (const [x, y, c, s, copy] of spec.board ?? []) board[cellKey(x, y)] = take(c, s, copy);
    const players: PlayerState[] = spec.hands.map((hand, i) => {
        const type = spec.types?.[i] ?? 'human';
        return { id: `p${i + 1}`, name: `Joueur ${i + 1}`, type, ...(type === 'ai' ? { aiLevel: 'intermediate' as const } : {}), score: 0, hand: hand.map(([c, s, copy]) => take(c, s, copy)) };
    });
    const rest = ALL_TILES.map(t => t.id).filter(id => !used.has(id));
    return {
        version: 1, seed: 'fixture', rngState: [1, 2, 3, 4],
        phase: spec.phase ?? (Object.keys(board).length ? 'playing' : 'opening'),
        turnNumber: spec.turn ?? 0, currentPlayerIndex: spec.current ?? 0, tilesById: tilesRecord(), board, players,
        bag: spec.bagCount === undefined ? rest : rest.slice(0, spec.bagCount), consecutivePasses: 0, config: { ...DEFAULT_RULES }, endReason: null
    };
}
export const human = (id: string) => ({ id, name: id, type: 'human' as const });
export const bot = (id: string, aiLevel: 'beginner' | 'intermediate' = 'beginner') => ({ id, name: id, type: 'ai' as const, aiLevel });
