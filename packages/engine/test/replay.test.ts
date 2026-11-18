import { describe, expect, it } from 'vitest';
import { stateHash } from '../src/apply';
import { replay } from '../src/replay';
import { configOf, playGame } from './play';

const RUNS = Number(process.env.T17_RUNS ?? 20);
describe('replay', () => {
    it(`T17 replaying the log gives the same final hash (${RUNS} games)`, () => {
        for (let i = 0; i < RUNS; i++) {
            const config = configOf(2 + (i % 3));
            const seed = `t17-${i}`;
            const a = playGame(config, seed);
            expect(a.state.phase).toBe('finished');
            expect(stateHash(replay(config, seed, a.events))).toBe(stateHash(a.state));
            expect(a.events[a.events.length - 1]?.stateHash).toBe(stateHash(a.state));
        }
    }, 600_000);
    it('replay throws on a broken hash chain', () => {
        const config = configOf(2);
        const { events } = playGame(config, 'chaine', { maxTurns: 6 });
        const tampered = events.map((e, i) => (i === 2 ? { ...e, hash: '0123456789abcdef' } : e));
        expect(() => replay(config, 'chaine', tampered)).toThrow(/empreinte/);
        const altered = events.map((e, i) => (i === 1 ? { ...e, stateHash: 'ffffffffffffffff' } : e));
        expect(() => replay(config, 'chaine', altered)).toThrow();
        expect(() => replay(config, 'autre-graine', events)).toThrow();
        expect(() => replay(config, 'chaine', events.slice(1))).toThrow(/numéro/);
    });
    it('duplicate actionId is rejected', () => {
        const config = configOf(2);
        const { events } = playGame(config, 'doublon', { maxTurns: 3 });
        const e1 = events[1];
        if (!e1) throw new Error('événement');
        expect(() => replay(config, 'doublon', [events[0] ?? e1, { ...e1, actionId: events[0]?.actionId ?? '' }])).toThrow(/déjà jouée/);
    });
});
