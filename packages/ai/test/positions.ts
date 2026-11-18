// Positions de test tirées de vraies parties simulées.
import { projectPublicState, validateAction } from '@six-de-chaque/engine';
import type { GameState, PublicGameState, TileId } from '@six-de-chaque/engine';
import { configOf, playGame } from '../../engine/test/play';

export interface Position { state: GameState; view: PublicGameState; hand: TileId[]; playerId: string; passLegal: boolean }
export function positionOf(state: GameState): Position {
    const p = state.players[state.currentPlayerIndex];
    if (!p) throw new Error('joueur');
    const passLegal = validateAction(state, { type: 'PASS', actorId: p.id, expectedTurn: state.turnNumber, actionId: 'probe' }).ok;
    return { state, view: projectPublicState(state, p.id), hand: [...p.hand], playerId: p.id, passLegal };
}
export function positions(seed: string, turns: number): Position[] {
    const out: Position[] = [];
    playGame(configOf(2), seed, { maxTurns: turns, limit: 6, pick: n => (seed.length + out.length) % Math.max(n, 1), each: ({ state }) => { if (state.phase !== 'finished') out.push(positionOf(state)); } });
    return out;
}
