import { cpus } from 'node:os';
import { expect, it } from 'vitest';
import { createGame } from '@six-de-chaque/engine';
import { decideNow } from '../src/policies';
import { configOf } from '../../engine/test/play';
import { positionOf, positions } from './positions';

it('ai decision time on reference positions', () => {
    const budget = 512;
    const seed = 'banc-reference';
    const middle = positions(seed, 30);
    const references = [
        ['opening', positionOf(createGame(configOf(2), seed))],
        ['turn 10', middle[9]!],
        ['turn 30', middle[29]!]
    ] as const;
    console.info(cpus()[0]?.model ?? 'CPU inconnu');
    for (const [label, { view, hand, playerId, passLegal }] of references) {
        for (const level of ['beginner', 'intermediate', 'advanced', 'expert'] as const) {
            const runs: number[] = [];
            let nodes = 0;
            for (let i = 0; i < 9; i++) {
                const start = performance.now();
                const result = decideNow(view, hand, playerId, level, budget, view.turnNumber, passLegal);
                runs.push(performance.now() - start);
                expect(result.evaluatedNodes).toBeLessThanOrEqual(budget);
                nodes = result.evaluatedNodes;
            }
            runs.sort((a, b) => a - b);
            console.info(`${label} | ${level} | ${runs[4]?.toFixed(3)} ms | ${nodes} nœuds`);
        }
    }
});
