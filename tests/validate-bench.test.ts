// Plateau synthétique de rangées séparées et médiane de 15 passes de validation.
import { cpus } from 'node:os';
import { it, expect } from 'vitest';
import { cellKey, tileId, validateAction } from '@six-de-chaque/engine';
import type { GameAction, GameState, Tile } from '@six-de-chaque/engine';
import { stateFrom } from '../packages/engine/test/fixtures';

// Cible : moins de 10 ms par validation (médiane des 15 passes rapportée au nombre de coups).
const LIMIT_MS_PER_VALIDATION = 10;

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
    const msPerAction = median / actions.length;
    expect(msPerAction, `${msPerAction.toFixed(4)} ms par validation (médiane)`).toBeLessThan(LIMIT_MS_PER_VALIDATION);
});

// Médiane d'appels individuels (et non d'une moyenne par lot) : chaque appel est chronométré seul, pour des poses
// valides de 1 à 6 tuiles sur un plateau de 200 tuiles. La cible de 10 ms est rapportée avec le modèle de CPU.
it('validateAction median per single move stays under 10 ms, six-tile placements included', () => {
    const size = 200;
    const base = stateFrom({ hands: [[[0, 0]], [[1, 1]]], phase: 'playing' });
    const board: Record<string, string> = {};
    const tilesById: Record<string, Tile> = { ...base.tilesById };
    // Rangées complètes séparées d'une rangée vide : rangée r en y = 2r, couleur r % 6, formes 0 à 5.
    for (let i = 0; i < size; i++) {
        const row = Math.floor(i / 6);
        const id = `synthetic-${i}`;
        tilesById[id] = { id, color: row % 6, shape: i % 6 };
        board[cellKey(i % 6, row * 2)] = id;
    }
    const fullRows = Math.floor(size / 6);
    // Pose de k tuiles dans la rangée vide entre les rangées r et r + 1 : couleur c distincte des deux, formes 0 à k − 1.
    // Chaque tuile forme une colonne de trois (même forme, trois couleurs) et la pose une ligne de même couleur.
    const cases: Array<{ k: number; state: GameState; action: GameAction }> = [];
    for (let k = 1; k <= 6; k++) {
        for (let r = 0; r < fullRows - 1; r++) {
            const c = (r + 2) % 6;
            const hand = [0, 1, 2, 3, 4, 5].map(shape => tileId(c, shape, 0));
            const state: GameState = { ...base, board, tilesById, bag: [], players: base.players.map((p, i) => (i === 0 ? { ...p, hand } : p)) };
            const placements = hand.slice(0, k).map((id, x) => ({ tileId: id, x, y: r * 2 + 1 }));
            cases.push({ k, state, action: { type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: `s${k}-${r}`, placements } });
        }
    }
    expect(Object.keys(board)).toHaveLength(size);
    for (const { k, state, action } of cases) expect(validateAction(state, action), `pose de ${k} tuile(s)`).toEqual({ ok: true });
    const timings = new Map<number, number[]>();
    for (let pass = 0; pass < 6; pass++) {
        for (const { k, state, action } of cases) {
            const t0 = performance.now();
            validateAction(state, action);
            const elapsed = performance.now() - t0;
            if (pass > 0) timings.set(k, [...(timings.get(k) ?? []), elapsed]);
        }
    }
    const medianOf = (list: number[]): number => {
        const sorted = [...list].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? Infinity;
    };
    const all = [...timings.values()].flat();
    const report = [...timings].map(([k, list]) => `${k} tuile(s) ${medianOf(list).toFixed(4)} ms`).join(', ');
    console.log(`${cpus()[0]?.model ?? 'CPU inconnu'} | ${size} tuiles | ${all.length} appels individuels | médiane ${medianOf(all).toFixed(4)} ms | ${report}`);
    expect(timings.size).toBe(6);
    for (const [k, list] of timings) {
        expect(list.length).toBeGreaterThan(100);
        expect(medianOf(list), `médiane par appel, pose de ${k} tuile(s)`).toBeLessThan(LIMIT_MS_PER_VALIDATION);
    }
});
