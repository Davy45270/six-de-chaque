import { describe, expect, it } from 'vitest';
import { stateHash } from '../src/apply';
import { replay } from '../src/replay';
import { configOf, playGame } from './play';

const RUNS = Number(process.env.T17_RUNS ?? 20);
describe('replay', () => {
    it(`T17 replaying the log gives the same final hash (${RUNS} games)`, () => {
        expect(RUNS, 'T17_RUNS doit valoir au moins 1').toBeGreaterThanOrEqual(1);
        let replayed = 0;
        for (let i = 0; i < RUNS; i++) {
            const config = configOf(2 + (i % 3));
            const seed = `t17-${i}`;
            const a = playGame(config, seed);
            expect(a.state.phase).toBe('finished');
            expect(stateHash(replay(config, seed, a.events))).toBe(stateHash(a.state));
            expect(a.events[a.events.length - 1]?.stateHash).toBe(stateHash(a.state));
            replayed++;
        }
        expect(replayed, 'parties rejouées').toBe(RUNS);
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

it('replay rejects an event whose finalBonus was altered', () => {
    const config = configOf(2);
    const { events } = playGame(config, 'bonus', { maxTurns: 1 });
    expect(() => replay(config, 'bonus', [{ ...events[0]!, finalBonus: 6 }])).toThrow(/bonus/);
});

it('replay rejects an event whose actionId differs from its action', () => {
    const config = configOf(2);
    const { events } = playGame(config, 'identité', { maxTurns: 1 });
    expect(() => replay(config, 'identité', [{ ...events[0]!, actionId: 'autre' }])).toThrow(/identifiant/);
});

it('T17 two independent runs of the same seed give the same final hash', () => {
    const run = () => playGame(configOf(3), 'parties-indépendantes');
    const first = run().state;
    const second = run().state;
    expect(first.phase).toBe('finished');
    expect(second.phase).toBe('finished');
    expect(stateHash(first)).toBe(stateHash(second));
});

it(`T17 every game is replayed and also replayed independently from the same seed to the same final hash`, () => {
    expect(RUNS, 'T17_RUNS doit valoir au moins 1').toBeGreaterThanOrEqual(1);
    let checked = 0;
    for (let i = 0; i < RUNS; i++) {
        const config = configOf(2 + (i % 3));
        const seed = `t17-${i}`;
        const original = playGame(config, seed);
        expect(original.state.phase).toBe('finished');
        const expected = stateHash(original.state);
        expect(stateHash(replay(config, seed, original.events)), `rejeu du journal, graine ${seed}`).toBe(expected);
        const independent = playGame(config, seed);
        expect(independent.state.phase).toBe('finished');
        expect(stateHash(independent.state), `partie indépendante, graine ${seed}`).toBe(expected);
        expect(independent.events.map(e => e.hash), `journal indépendant, graine ${seed}`).toEqual(original.events.map(e => e.hash));
        checked++;
    }
    expect(checked, 'graines vérifiées deux fois').toBe(RUNS);
}, 1_200_000);
