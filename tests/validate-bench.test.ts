// Banc de la validation (mesure, pas un objectif) : plateau synthétique des 108 tuiles — 18 rangées des six formes, la
// couleur r mod 6 et la copie r div 6 pour la rangée r, une rangée vide entre deux — et 1 000 coups d'une tuile validés. Rapporte la médiane de
// 15 passes. Hors du paquet moteur, qui n'a pas le droit de lire l'horloge.
import { it, expect } from 'vitest';
import { cellKey, tileId, validateAction } from '@six-de-chaque/engine';
import type { GameAction } from '@six-de-chaque/engine';
import { stateFrom } from '../packages/engine/test/fixtures';

it('validateAction × 1000 on a 108-tile board (median reported)', () => {
    const base = stateFrom({ hands: [[[0, 0]], [[1, 1]]], phase: 'playing' });
    const board: Record<string, string> = {};
    for (let r = 0; r < 18; r++) for (let x = 0; x < 6; x++) board[cellKey(x, r * 2)] = tileId(r % 6, x, Math.floor(r / 6));
    const hand = [0, 1, 2, 3, 4, 5].map(x => tileId(0, x, 0));
    const state = { ...base, board, bag: [], players: base.players.map((p, i) => (i === 0 ? { ...p, hand } : p)) };
    const actions: GameAction[] = Array.from({ length: 1000 }, (_, i) => ({
        type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: `b${i}`,
        placements: [{ tileId: hand[i % 6] ?? '', x: i % 2 ? -1 : i % 6, y: (i % 18) * 2 + (i % 2 ? 0 : 1) }]
    }));
    const runs: number[] = [];
    let accepted = 0;
    for (let r = 0; r < 15; r++) {
        const t0 = performance.now();
        accepted = actions.filter(a => validateAction(state, a).ok).length;
        runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const median = runs[7] ?? 0;
    console.log(`banc validation : 1000 coups en ${median.toFixed(2)} ms (médiane), ${(median / 1000 * 1000).toFixed(1)} µs par coup, ${accepted} acceptés`);
    expect(accepted).toBeGreaterThan(0);
});
