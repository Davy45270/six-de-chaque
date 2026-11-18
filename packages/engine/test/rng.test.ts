import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextUint32, randomInt, seedToState, shuffle } from '../src/rng';
import { canonicalJson, fnv1a64 } from '../src/hash';
import type { RngState } from '../src/types';

const ids = Array.from({ length: 108 }, (_, i) => i);
describe('deterministic RNG', () => {
    it('xoshiro128** reference vector', () => {
        let s: RngState = [1, 2, 3, 4];
        const out: number[] = [];
        for (let i = 0; i < 4; i++) { const [v, n] = nextUint32(s); out.push(v); s = n; }
        expect(out).toEqual([11520, 0, 5927040, 70819200]);
    });
    it('same seed same shuffle, different seed different shuffle', () => {
        expect(shuffle(ids, seedToState('graine'))).toEqual(shuffle(ids, seedToState('graine')));
        expect(shuffle(ids, seedToState('graine'))[0]).not.toEqual(shuffle(ids, seedToState('autre'))[0]);
    });
    it('shuffle is a permutation and does not mutate its input', () => {
        fc.assert(fc.property(fc.string(), seed => {
            const copy = [...ids];
            const [out] = shuffle(ids, seedToState(seed));
            expect(ids).toEqual(copy);
            expect([...out].sort((a, b) => a - b)).toEqual(ids);
        }), { numRuns: 200 });
    });
    it('seedToState never returns all zeros', () => {
        fc.assert(fc.property(fc.string(), seed => { expect(seedToState(seed).some(v => v !== 0)).toBe(true); }), { numRuns: 200 });
        expect(seedToState('').every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)).toBe(true);
    });
    it('randomInt stays in range and is pure', () => {
        const s = seedToState('x');
        const before = [...s];
        for (const max of [1, 2, 6, 7, 108]) { const [v] = randomInt(max, s); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(max); }
        expect(s).toEqual(before);
    });
});
describe('fingerprints', () => {
    it('fnv1a64 reference values', () => {
        expect(fnv1a64('')).toBe('cbf29ce484222325');
        expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
        expect(fnv1a64('foobar')).toBe('85944171f73967e8');
    });
    it('canonicalJson ignores key order', () => {
        expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
        expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
        expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    });
});
