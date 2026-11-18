import { describe, expect, it } from 'vitest';
import { createGame } from '../src/create';
import { checkInvariants } from '../src/invariants';
import { boardLookup, isValidLine, largestCompatibleGroup, parseKey } from '../src/lines';
import { tileId, tileOf } from '../src/tiles';
import { bot, human } from './fixtures';

const t = (c: number, s: number, copy = 0) => tileOf(tileId(c, s, copy));
const config = (n: number) => ({ players: [human('a'), ...Array.from({ length: n - 1 }, (_, i) => bot(`b${i}`))] });

describe('createGame', () => {
    it('createGame deals 6 tiles to each of 2..4 players and leaves 108-6n in the bag', () => {
        for (const n of [2, 3, 4]) {
            const g = createGame(config(n), 'graine');
            expect(g.players.map(p => p.hand.length)).toEqual(Array(n).fill(6));
            expect(g.bag).toHaveLength(108 - 6 * n);
        }
    });
    it('createGame is deterministic for a seed', () => {
        expect(createGame(config(3), 'x')).toEqual(createGame(config(3), 'x'));
        expect(createGame(config(3), 'x').bag).not.toEqual(createGame(config(3), 'y').bag);
    });
    it('createGame rejects 1 or 5 players and a game without human', () => {
        expect(() => createGame(config(1), 's')).toThrow();
        expect(() => createGame(config(5), 's')).toThrow();
        expect(() => createGame({ players: [bot('x'), bot('y')] }, 's')).toThrow();
        expect(() => createGame({ players: [human('x'), human('x')] }, 's')).toThrow();
        expect(() => createGame({ players: [human('x'), { id: 'y', name: 'y', type: 'ai' }] }, 's')).toThrow();
    });
    it('first player holds the largest compatible group', () => {
        for (let i = 0; i < 40; i++) {
            const g = createGame(config(4), `premier-${i}`);
            const groups = g.players.map(p => largestCompatibleGroup(p.hand.map(tileOf)));
            expect(groups[g.currentPlayerIndex]).toBe(Math.max(...groups));
        }
    });
    it('tie on largest group is broken by the seed', () => {
        const firsts = new Set<number>();
        let ties = 0;
        for (let i = 0; i < 200 && firsts.size < 2; i++) {
            const g = createGame(config(2), `egalite-${i}`);
            const groups = g.players.map(p => largestCompatibleGroup(p.hand.map(tileOf)));
            if (groups[0] === groups[1]) { ties++; firsts.add(g.currentPlayerIndex); expect(createGame(config(2), `egalite-${i}`).currentPlayerIndex).toBe(g.currentPlayerIndex); }
        }
        expect(ties).toBeGreaterThan(0);
        expect(firsts).toEqual(new Set([0, 1]));
    });
    it('phase is "opening" and consecutivePasses 0 at creation', () => {
        const g = createGame(config(2), 's');
        expect(g.phase).toBe('opening');
        expect(g.consecutivePasses).toBe(0);
        expect(g.endReason).toBeNull();
        expect(g.config).toEqual({ blockedEndPolicy: 'fullPassRound', coordinateLimit: 100_000 });
    });
    it('checkInvariants of a fresh game is empty', () => {
        for (const n of [2, 3, 4]) expect(checkInvariants(createGame(config(n), `inv-${n}`))).toEqual([]);
    });
    it('checkInvariants reports duplicates, missing tiles and oversize hands', () => {
        const g = createGame(config(2), 's');
        const p0 = g.players[0];
        if (!p0) throw new Error('joueur');
        expect(checkInvariants({ ...g, bag: g.bag.slice(1) })).toContain('107 tuiles au lieu de 108');
        expect(checkInvariants({ ...g, bag: [...g.bag.slice(1), p0.hand[0] ?? ''] }).join()).toContain('double');
        expect(checkInvariants({ ...g, players: [{ ...p0, hand: [...p0.hand, g.bag[0] ?? ''] }, ...g.players.slice(1)], bag: g.bag.slice(1) }).join()).toContain('main de 7');
        expect(checkInvariants({ ...g, currentPlayerIndex: 2 })).toContain('joueur courant hors bornes');
    });
});

describe('lines', () => {
    it('largestCompatibleGroup counts exact duplicates once', () => {
        expect(largestCompatibleGroup([t(0, 0), t(0, 0, 1), t(0, 1)])).toBe(2);
        expect(largestCompatibleGroup([t(0, 0), t(1, 0), t(2, 0), t(3, 1)])).toBe(3);
        expect(largestCompatibleGroup([])).toBe(0);
    });
    it('parseKey and boardLookup', () => {
        expect(parseKey('-3:12')).toEqual({ x: -3, y: 12 });
        expect(parseKey('x')).toEqual({ x: Number.NaN, y: Number.NaN });
        expect(boardLookup({ '1:2': 't-001' })(1, 2)).toBe('t-001');
        expect(boardLookup({ '1:2': 't-001' }, new Map([['1:2', 't-009']]))(1, 2)).toBe('t-009');
        expect(boardLookup({})(0, 0)).toBeUndefined();
    });
    it('isValidLine', () => {
        expect(isValidLine([t(0, 0), t(0, 1), t(0, 2)])).toBe(true);
        expect(isValidLine([t(0, 0), t(1, 0)])).toBe(true);
        expect(isValidLine([t(0, 0), t(1, 1)])).toBe(false);
        expect(isValidLine([t(0, 0), t(0, 0, 1)])).toBe(false);
        expect(isValidLine([0, 1, 2, 3, 4, 5, 0].map(s => t(0, s, s === 0 ? 1 : 0)))).toBe(false);
        expect(isValidLine([])).toBe(false);
        expect(isValidLine([t(4, 4)])).toBe(true);
    });
});
