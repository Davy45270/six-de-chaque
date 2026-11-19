import { describe, expect, it } from 'vitest';
import { gameSchema, validateGameAction, validateGameSnapshot, validateGameSnapshotV1 } from '../src/index';
import { createGame } from '@six-de-chaque/engine';

const id = (i: number): string => `t-${String(i).padStart(3, '0')}`;
function minimal(): Record<string, unknown> {
    const tilesById: Record<string, unknown> = {};
    for (let i = 0; i < 108; i++) tilesById[id(i)] = { id: id(i), color: Math.floor(i / 18), shape: Math.floor(i / 3) % 6 };
    const all = Array.from({ length: 108 }, (_, i) => id(i));
    return {
        version: 2, seed: 'essai', rngState: [1, 2, 3, 4], phase: 'opening', turnNumber: 0, currentPlayerIndex: 0, tilesById, board: {},
        players: [
            { id: 'p1', name: 'Alice', type: 'human', score: 0, hand: all.slice(0, 6) },
            { id: 'p2', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner', score: 0, hand: all.slice(6, 12) }
        ],
        bag: all.slice(12), consecutivePasses: 0, config: { blockedEndPolicy: 'fullPassRound', coordinateLimit: 100_000 }, endReason: null
    };
}
const place = (n: number): unknown => ({ type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'a1',
    placements: Array.from({ length: n }, (_, i) => ({ tileId: id(i), x: i, y: 0 })) });

it('v1 schema matches the specification contract', () => {
    const string = { type: 'string' };
    const integer = (minimum: number, maximum?: number) => ({ type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) });
    expect(gameSchema).toEqual({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Six de chaque GameState v1 (wire snapshot)',
        type: 'object',
        additionalProperties: false,
        required: ['version', 'seed', 'rngState', 'phase', 'turnNumber', 'currentPlayerIndex', 'tilesById', 'board', 'players', 'bag'],
        properties: {
            version: { const: 1 }, seed: { ...string, minLength: 1 },
            rngState: { type: 'array', items: integer(0, 4294967295), minItems: 4, maxItems: 4 },
            phase: { enum: ['opening', 'playing', 'finished'] }, turnNumber: integer(0), currentPlayerIndex: integer(0, 3),
            tilesById: { type: 'object', additionalProperties: { $ref: '#/$defs/tile' } },
            board: { type: 'object', propertyNames: { pattern: '^-?(0|[1-9][0-9]*):-?(0|[1-9][0-9]*)$' }, additionalProperties: string },
            players: { type: 'array', minItems: 2, maxItems: 4, items: {
                type: 'object', additionalProperties: false, required: ['id', 'name', 'type', 'score', 'hand'],
                properties: { id: string, name: string, type: { enum: ['human', 'ai'] }, score: integer(0), hand: { type: 'array', maxItems: 6, items: string } }
            } },
            bag: { type: 'array', items: string }
        },
        $defs: { tile: { type: 'object', additionalProperties: false, required: ['id', 'color', 'shape'],
            properties: { id: string, color: integer(0, 5), shape: integer(0, 5) } } }
    });
});

it('snapshot with an extra field is rejected (no secret can be stored)', () => {
    const { consecutivePasses: _p, config: _c, endReason: _e, ...base } = minimal();
    const players = (base.players as Array<Record<string, unknown>>).map(({ aiLevel: _a, ...player }) => player);
    const v1 = { ...base, version: 1, players };
    expect(validateGameSnapshotV1(v1).ok).toBe(true);
    expect(validateGameSnapshotV1({ ...v1, secret: 'private' }).ok).toBe(false);
    const v2 = { ...minimal(), version: 2 };
    expect(validateGameSnapshot(v2).ok).toBe(true);
    expect(validateGameSnapshot({ ...v2, secret: 'private' }).ok).toBe(false);
    expect(validateGameSnapshot({ ...v2, players: [{ ...players[0], secret: 'private' }, players[1]] }).ok).toBe(false);
});

it('EXCHANGE schema accepts 1 to 6 tiles only', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) {
        expect(validateGameAction({ type: 'EXCHANGE', actorId: 'p1', expectedTurn: 2, actionId: 'a',
            tileIds: Array.from({ length: n }, (_, i) => id(i)) }).ok).toBe(n >= 1 && n <= 6);
    }
});

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
    it('every action variant requires a non-negative integer expectedTurn', () => {
        const variants = [
            { type: 'PLACE', placements: [{ tileId: id(0), x: 0, y: 0 }] },
            { type: 'EXCHANGE', tileIds: [id(0)] },
            { type: 'PASS' }
        ];
        for (const variant of variants) {
            const action = { ...variant, actorId: 'p1', actionId: 'a' };
            expect(validateGameAction({ ...action, expectedTurn: 0 }).ok, variant.type).toBe(true);
            expect(validateGameAction(action).ok, `${variant.type} sans expectedTurn`).toBe(false);
            for (const expectedTurn of [-1, 1.5, '1']) {
                expect(validateGameAction({ ...action, expectedTurn }).ok, `${variant.type} avec expectedTurn=${JSON.stringify(expectedTurn)}`).toBe(false);
            }
        }
    });
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

describe('engine snapshots', () => {
    it('createGame refuses a coordinate limit the save contract rejects', () => {
        const players = [{ id: 'p1', name: 'Alice', type: 'human' as const }, { id: 'p2', name: 'Bob', type: 'human' as const }];
        const limited = createGame({ players, rules: { coordinateLimit: 1 } }, 'graine');
        const standard = createGame({ players, rules: { coordinateLimit: 100_000 } }, 'graine');
        for (const coordinateLimit of [0, -1, 1.5, 100_001, 2 ** 53]) {
            expect.soft(() => createGame({ players, rules: { coordinateLimit } }, 'graine')).toThrow(/limite de coordonnées/i);
            expect.soft(validateGameSnapshot({ ...standard, config: { ...standard.config, coordinateLimit } }).ok).toBe(false);
        }
        expect(limited.config.coordinateLimit).toBe(1);
        expect(standard.config.coordinateLimit).toBe(100_000);
        expect(validateGameSnapshot(limited).ok).toBe(true);
        expect(validateGameSnapshot(standard).ok).toBe(true);
    });

    it('v2 snapshot from createGame validates', () => {
        for (const n of [2, 4]) {
            const players = [{ id: 'h', name: 'Humain', type: 'human' as const }, ...Array.from({ length: n - 1 }, (_, i) => ({ id: `o${i}`, name: 'Ordinateur', type: 'ai' as const, aiLevel: (['intermediate', 'advanced', 'expert'] as const)[i % 3]! }))];
            const state = createGame({ players }, `schema-${n}`);
            expect(state.version).toBe(2);
            expect(validateGameSnapshot(state)).toMatchObject({ ok: true });
        }
    });
});

describe('PLACE placement object', () => {
    const withPlacement = (placement: unknown): unknown => ({ type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'a1', placements: [{ tileId: id(0), x: 0, y: 0 }, placement] });
    it('a PLACE placement with an extra property is rejected', () => {
        expect(validateGameAction(withPlacement({ tileId: id(1), x: 1, y: 0 })).ok).toBe(true);
        for (const extra of [{ score: 6 }, { note: 'ajout' }, { color: 0 }]) {
            expect(validateGameAction(withPlacement({ tileId: id(1), x: 1, y: 0, ...extra })).ok, JSON.stringify(extra)).toBe(false);
        }
    });
    it('a PLACE placement missing tileId, x or y is rejected', () => {
        for (const key of ['tileId', 'x', 'y']) {
            const placement = Object.fromEntries(Object.entries({ tileId: id(1), x: 1, y: 0 }).filter(([k]) => k !== key));
            expect(validateGameAction(withPlacement(placement)).ok, `sans ${key}`).toBe(false);
        }
    });
    it('a PLACE placement with non-integer coordinates is rejected', () => {
        expect(validateGameAction(withPlacement({ tileId: id(1), x: -100_000, y: 100_000 })).ok).toBe(true);
        for (const [x, y] of [[1.5, 0], [1, -0.5], ['1', 0], [1, '0'], [null, 0], [1, Number.NaN]] as const) {
            expect(validateGameAction(withPlacement({ tileId: id(1), x, y })).ok, `x=${String(x)} y=${String(y)}`).toBe(false);
        }
    });
});
