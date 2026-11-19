import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateAction } from '../src/validate';
import { ALL_TILES, tileId } from '../src/tiles';
import type { GameAction, GameState } from '../src/types';
import { stateFrom } from './fixtures';
import type { FixtureSpec } from './fixtures';

type P = [number, number, number, number, number?];   // x, y, couleur, forme, copie
/** Pose les tuiles `moves` (prises dans la main du joueur 1, construite à partir d'elles). */
function check(spec: Omit<FixtureSpec, 'hands'> & { extraHand?: Array<[number, number, number?]> }, moves: P[]) {
    const state = stateFrom({ ...spec, hands: [[...moves.map(([, , c, s, copy]) => [c, s, copy] as [number, number, number?]), ...(spec.extraHand ?? [])], [[5, 5, 2]]] });
    const hand = state.players[0]?.hand ?? [];
    const action: GameAction = { type: 'PLACE', actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'a', placements: moves.map(([x, y], i) => ({ tileId: hand[i] ?? '', x, y })) };
    return { state, action, result: validateAction(state, action) };
}
const code = (r: ReturnType<typeof validateAction>) => (r.ok ? 'OK' : r.code);

describe('validateAction PLACE', () => {
    it('T02 single tile on empty board is valid', () => { expect(check({}, [[0, 0, 0, 0]]).result).toEqual({ ok: true }); });
    it('T03 three distinct shapes of one colour on empty board is valid', () => {
        expect(code(check({}, [[0, 0, 0, 0], [1, 0, 0, 1], [2, 0, 0, 2]]).result)).toBe('OK');
        expect(code(check({}, [[4, 7, 0, 0], [4, 8, 1, 0], [4, 9, 2, 0]]).result)).toBe('OK');
    });
    it('T06 two new tiles around an existing one are valid', () => {
        expect(code(check({ board: [[1, 0, 0, 1]] }, [[0, 0, 0, 0], [2, 0, 0, 2]]).result)).toBe('OK');
    });
    it('gap without existing tile is rejected', () => {
        expect(code(check({ board: [[0, 0, 0, 0]] }, [[1, 0, 0, 1], [3, 0, 0, 3]]).result)).toBe('GAP');
    });
    it('T07 diagonal is rejected', () => { expect(code(check({}, [[0, 0, 0, 0], [1, 1, 0, 1]]).result)).toBe('NOT_ALIGNED'); });
    it('T08 seventh tile is rejected', () => {
        expect(code(check({ board: [0, 1, 2, 3, 4, 5].map(s => [s, 0, 0, s] as P) }, [[6, 0, 1, 0]]).result)).toBe('LINE_TOO_LONG');
    });
    it('T09 exact duplicate in a line is rejected', () => {
        expect(code(check({ board: [[0, 0, 0, 0, 0]] }, [[1, 0, 0, 0, 1]]).result)).toBe('INVALID_LINE');
    });
    it('T10 crossing line violation is rejected', () => {
        expect(code(check({ board: [[0, 0, 0, 0], [1, 0, 0, 1]] }, [[0, 1, 1, 0], [1, 1, 1, 2]]).result)).toBe('INVALID_LINE');
    });
    it('T11 disconnected move is rejected unless board is empty', () => {
        expect(code(check({ board: [[0, 0, 0, 0]] }, [[5, 5, 0, 1]]).result)).toBe('DISCONNECTED');
        expect(code(check({}, [[5, 5, 0, 1]]).result)).toBe('OK');
    });
    it('T12 tile not in hand / duplicated id / occupied cell are rejected', () => {
        const { state, action } = check({ board: [[0, 0, 0, 0]] }, [[1, 0, 0, 1]]);
        const p = action.placements[0];
        if (!p) throw new Error('placement');
        expect(code(validateAction(state, { ...action, placements: [{ ...p, tileId: tileId(3, 3, 0) }] }))).toBe('NOT_IN_HAND');
        expect(code(validateAction(state, { ...action, placements: [p, { ...p, x: 2 }] }))).toBe('DUPLICATE_TILE');
        expect(code(validateAction(state, { ...action, placements: [{ ...p, x: 0 }] }))).toBe('OCCUPIED');
        expect(code(validateAction(state, { ...action, placements: [] }))).toBe('EMPTY');
    });
    it('two tiles on one cell are rejected', () => {
        const { state, action } = check({}, [[0, 0, 0, 0], [0, 0, 0, 1]]);
        expect(code(validateAction(state, action))).toBe('DUPLICATE_CELL');
    });
    it('wrong actor and stale expectedTurn are rejected', () => {
        const { state, action } = check({}, [[0, 0, 0, 0]]);
        expect(code(validateAction(state, { ...action, actorId: 'p2' }))).toBe('NOT_YOUR_TURN');
        expect(code(validateAction(state, { ...action, expectedTurn: 3 }))).toBe('WRONG_TURN');
        expect(code(validateAction({ ...state, phase: 'finished' }, action))).toBe('GAME_OVER');
    });
    it('non-integer and out-of-bounds coordinates are rejected', () => {
        expect(code(check({}, [[0.5, 0, 0, 0]]).result)).toBe('NOT_INTEGER');
        expect(code(check({}, [[100_001, 0, 0, 0]]).result)).toBe('OUT_OF_BOUNDS');
        expect(code(check({}, [[-100_000, 0, 0, 0]]).result)).toBe('OK');
    });
    it('validateAction never mutates its arguments', () => {
        const cell = fc.tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }));
        fc.assert(fc.property(fc.array(cell, { maxLength: 4 }), fc.array(cell, { minLength: 1, maxLength: 3 }), (boardCells, moveCells) => {
            const board = new Map<string, P>();
            for (const [x, y, c, s] of boardCells) board.set(`${x}:${y}`, [x, y, c, s, 0]);
            const moves = moveCells.map(([x, y, c, s]) => [x, y, c, s, 1] as P);
            let built: { state: GameState; action: GameAction };
            try { built = check({ board: [...board.values()] }, moves); } catch { return; }
            const before = structuredClone(built);
            validateAction(built.state, built.action);
            expect(built).toEqual(before);
        }), { numRuns: 300 });
    });
});

it('placement validation reads O(k·L) cells', () => {
    const cross: P[] = [1, 2, 3, 4, 5].flatMap(i => [[-i, 0, 0, i, 0], [0, -i, i, 0, 0]] as P[]);
    for (const placements of [[[0, 0, 0, 0, 0]], [[1, -1, 1, 1, 0], [2, -1, 1, 2, 0]]] satisfies P[][]) {
        const used = new Set([...cross, ...placements, [0, 0, 5, 5, 2] as P]
            .map(([, , color, shape, copy]) => tileId(color, shape, copy ?? 0)));
        const filler = ALL_TILES.filter(t => !used.has(t.id)).map((t, i): P => [
            20 + i * 2, 20, t.color, t.shape, [0, 1, 2].find(c => tileId(t.color, t.shape, c) === t.id)
        ]);
        for (const size of [10, 100]) {
            const { state, action, result } = check({ board: [...cross, ...filler].slice(0, size) }, placements);
            expect(Object.keys(state.board)).toHaveLength(size);
            expect(result).toEqual({ ok: true });
            let reads = 0;
            // Compte les lectures du contenu et détecte les parcours du plateau entier.
            const measured = new Proxy(state.board, {
                get(target, key) { reads++; return typeof key === 'string' ? target[key] : undefined; },
                ownKeys(target) { const keys = Reflect.ownKeys(target); reads += keys.length; return keys; }
            });
            expect(validateAction({ ...state, board: measured }, action)).toEqual(result);
            expect(reads).toBeLessThanOrEqual(placements.length * 2 * 7);
        }
    }
});
