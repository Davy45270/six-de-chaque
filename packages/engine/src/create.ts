// Création d'une partie : mélange, distribution, premier joueur (plus grand groupe, égalité départagée par la graine).
import { ALL_TILES, HAND_SIZE, tileOf, tilesRecord } from './tiles';
import { randomInt, seedToState, shuffle } from './rng';
import { largestCompatibleGroup } from './lines';
import { GAME_VERSION } from './types';
import type { GameConfig, GameState, RulesConfig } from './types';

export const DEFAULT_RULES: RulesConfig = { blockedEndPolicy: 'fullPassRound', coordinateLimit: 100_000 };

export function createGame(config: GameConfig, seed: string): GameState {
    const n = config.players.length;
    if (n < 2 || n > 4) throw new Error('une partie se joue de 2 à 4 joueurs');
    if (!config.players.some(p => p.type === 'human')) throw new Error('il faut au moins un joueur humain');
    if (new Set(config.players.map(p => p.id)).size !== n) throw new Error('identifiants de joueurs en double');
    if (config.players.some(p => p.type === 'ai' && !p.aiLevel)) throw new Error('un joueur ordinateur a besoin d’un niveau');
    if (seed.length === 0) throw new Error('graine vide');
    const [order, afterShuffle] = shuffle(ALL_TILES.map(t => t.id), seedToState(seed));
    const players = config.players.map((p, i) => ({
        id: p.id, name: p.name, type: p.type, ...(p.type === 'ai' && p.aiLevel ? { aiLevel: p.aiLevel } : {}),
        score: 0, hand: order.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)
    }));
    const groups = players.map(p => largestCompatibleGroup(p.hand.map(tileOf)));
    const best = Math.max(...groups);
    const tied = groups.flatMap((g, i) => (g === best ? [i] : []));
    let rngState = afterShuffle;
    let first = tied[0] ?? 0;
    if (tied.length > 1) {
        const [pick, next] = randomInt(tied.length, rngState);
        rngState = next;
        first = tied[pick] ?? first;
    }
    return {
        version: GAME_VERSION, seed, rngState, phase: 'opening', turnNumber: 0, currentPlayerIndex: first,
        tilesById: tilesRecord(), board: {}, players, bag: order.slice(n * HAND_SIZE),
        consecutivePasses: 0, config: { ...DEFAULT_RULES, ...config.rules }, endReason: null
    };
}
