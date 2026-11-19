// Plateau synthétique de rangées séparées et médiane de 15 passes de validation.
import { cpus } from 'node:os';
import { it, expect } from 'vitest';
import { cellKey, tileId, validateAction } from '@six-de-chaque/engine';
import type { GameAction, Tile } from '@six-de-chaque/engine';
import { stateFrom } from '../packages/engine/test/fixtures';

it.each([108, 200])('validateAction × 1000 on a %i-tile board (median reported)', size => {
    const base = stateFrom({ hands: [[[0, 0]], [[1, 1]]], phase: 'playing' });
    const board: Record<string, string> = {};
    const rows = Math.ceil(size / 6);
    const tilesById: Record<string, Tile> = { ...base.tilesById };
    for (let i = 0; i < size; i++) {
        const row = Math.floor(i / 6);
        const id = `synthetic-${i}`;
        tilesById[id] = { id, color: row % 6, shape: i % 6 };
        board[cellKey(i % 6, row * 2)] = id;
    }
    expect(Object.keys(board)).toHaveLength(size);
    const hand = [0, 1, 2, 3, 4, 5].map(x => tileId(0, x, 0));
    const state = { ...base, board, tilesById, bag: [], players: base.players.map((p, i) => (i === 0 ? { ...p, hand } : p)) };
    const actions: GameAction[] = Array.from({ length: 1000 }, (_, i) => ({
        type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: `b${i}`,
        placements: [{ tileId: hand[i % 6] ?? '', x: i % 2 ? -1 : i % 6, y: (i % rows) * 2 + (i % 2 ? 0 : 1) }]
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
    const microsPerAction = median * 1000 / actions.length;
    console.log(`${cpus()[0]?.model ?? 'CPU inconnu'} | ${size} tuiles | 1 000 coups en ${median.toFixed(2)} ms (médiane), ${microsPerAction.toFixed(1)} µs par coup, ${accepted} acceptés`);
    expect(accepted).toBeGreaterThan(0);
});
