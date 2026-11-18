// PRNG déterministe : graine textuelle → cyrb128 → état xoshiro128** (quatre uint32). Fonctions pures.
import type { RngState } from './types';

export function seedToState(seed: string): RngState {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < seed.length; i++) {
        const k = seed.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1; h3 ^= h1; h4 ^= h1;
    const state: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
    // Un état tout à zéro est le seul point fixe de xoshiro : il est remplacé par une constante.
    return state.every(v => v === 0) ? [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x13198a2e] : state;
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
export function nextUint32(s: Readonly<RngState>): [number, RngState] {
    let [s0, s1, s2, s3] = s;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return [result, [s0, s1, s2, s3]];
}

/** Entier uniforme dans [0, max[, par rejet (pas de biais de modulo). */
export function randomInt(max: number, s: Readonly<RngState>): [number, RngState] {
    if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new RangeError(`borne invalide : ${max}`);
    const limit = Math.floor(0x100000000 / max) * max;
    let state: RngState = [s[0], s[1], s[2], s[3]];
    for (;;) {
        const [v, next] = nextUint32(state);
        state = next;
        if (v < limit) return [v % max, state];
    }
}

/** Fisher–Yates déterministe ; rend une nouvelle liste et le nouvel état. */
export function shuffle<T>(items: readonly T[], s: Readonly<RngState>): [T[], RngState] {
    const out = [...items];
    let state: RngState = [s[0], s[1], s[2], s[3]];
    for (let i = out.length - 1; i > 0; i--) {
        const [j, next] = randomInt(i + 1, state);
        state = next;
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
    }
    return [out, state];
}
