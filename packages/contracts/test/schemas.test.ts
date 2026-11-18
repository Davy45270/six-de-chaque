import { describe, expect, it } from 'vitest';
import { validateGameAction, validateGameSnapshot } from '../src/index';

const id = (i: number): string => `t-${String(i).padStart(3, '0')}`;
function minimal(): Record<string, unknown> {
    const tilesById: Record<string, unknown> = {};
    for (let i = 0; i < 108; i++) tilesById[id(i)] = { id: id(i), color: Math.floor(i / 18), shape: Math.floor(i / 3) % 6 };
    const all = Array.from({ length: 108 }, (_, i) => id(i));
    return {
        version: 1, seed: 'essai', rngState: [1, 2, 3, 4], phase: 'opening', turnNumber: 0, currentPlayerIndex: 0, tilesById, board: {},
        players: [
            { id: 'p1', name: 'Alice', type: 'human', score: 0, hand: all.slice(0, 6) },
            { id: 'p2', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner', score: 0, hand: all.slice(6, 12) }
        ],
        bag: all.slice(12), consecutivePasses: 0, config: { blockedEndPolicy: 'fullPassRound', coordinateLimit: 100_000 }, endReason: null
    };
}
const place = (n: number): unknown => ({ type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'a1',
    placements: Array.from({ length: n }, (_, i) => ({ tileId: id(i), x: i, y: 0 })) });

describe('game snapshot schema', () => {
    it('accepts a minimal valid snapshot', () => {
        const result = validateGameSnapshot(minimal());
        expect(result).toMatchObject({ ok: true });
        expect((minimal().bag as unknown[]).length).toBe(96);
    });
    it('rejects board key "1.5:0"', () => {
        expect(validateGameSnapshot({ ...minimal(), board: { '1.5:0': 't-000' } }).ok).toBe(false);
        expect(validateGameSnapshot({ ...minimal(), board: { '-3:12': 't-000' } }).ok).toBe(true);
    });
    it('rejects hand of 7', () => {
        const s = minimal();
        const players = s.players as Array<Record<string, unknown>>;
        players[0] = { ...players[0], hand: Array.from({ length: 7 }, (_, i) => id(i)) };
        const result = validateGameSnapshot(s);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join(' ')).toContain('hand');
    });
    it('rejects ai player without aiLevel', () => {
        const s = minimal();
        const players = s.players as Array<Record<string, unknown>>;
        players[1] = { id: 'p2', name: 'Ordinateur', type: 'ai', score: 0, hand: [] };
        expect(validateGameSnapshot(s).ok).toBe(false);
    });
    it('rejects a snapshot without the extended fields', () => {
        for (const key of ['consecutivePasses', 'config', 'endReason']) {
            const s = Object.fromEntries(Object.entries(minimal()).filter(([k]) => k !== key));
            expect(validateGameSnapshot(s).ok).toBe(false);
        }
    });
});

describe('game action schema', () => {
    it('accepts the three action types', () => {
        expect(validateGameAction(place(3)).ok).toBe(true);
        expect(validateGameAction({ type: 'EXCHANGE', actorId: 'p1', expectedTurn: 2, actionId: 'a', tileIds: ['t-001'] }).ok).toBe(true);
        expect(validateGameAction({ type: 'PASS', actorId: 'p1', expectedTurn: 2, actionId: 'a' }).ok).toBe(true);
    });
    it('rejects PLACE with 0 or 7 placements', () => {
        expect(validateGameAction(place(0)).ok).toBe(false);
        expect(validateGameAction(place(7)).ok).toBe(false);
    });
    it('rejects action with extra property', () => {
        expect(validateGameAction({ type: 'PASS', actorId: 'p1', expectedTurn: 2, actionId: 'a', bonus: 6 }).ok).toBe(false);
    });
});
