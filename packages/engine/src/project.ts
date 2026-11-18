// Projection publique : sans graine, état du PRNG ni réserve ; seule la main du spectateur est visible, sauf en fin.
import type { GameState, PlayerState, TileId } from './types';

export interface PublicGameState extends Omit<GameState, 'seed' | 'rngState' | 'bag' | 'players'> {
    bagCount: number;
    players: Array<Omit<PlayerState, 'hand'> & { hand: TileId[] | null; handCount: number }>;
}

export function projectPublicState(state: GameState, viewerId: string | null): PublicGameState {
    const reveal = state.phase === 'finished';
    const { seed: _seed, rngState: _rng, bag, players, ...rest } = state;
    return {
        ...rest,
        board: { ...state.board },
        tilesById: Object.fromEntries(Object.entries(state.tilesById).map(([k, t]) => [k, { ...t }])),
        config: { ...state.config },
        bagCount: bag.length,
        players: players.map(({ hand, ...p }) => ({ ...p, hand: reveal || p.id === viewerId ? [...hand] : null, handCount: hand.length }))
    };
}
