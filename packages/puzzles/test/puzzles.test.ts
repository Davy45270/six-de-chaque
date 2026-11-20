import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import * as engine from '@six-de-chaque/engine';
import { validatePuzzle } from '@six-de-chaque/contracts';
import { applyAction, canonicalJson, checkInvariants, createGame, fnv1a64, GAME_VERSION, replay } from '@six-de-chaque/engine';
import { certifyCandidate, generate, initialPuzzleState, playPuzzleTurn, playSource, solve } from '../src/index';
import type { Puzzle, PuzzlePosition } from '../src/index';
import { validateReferenceSolutions } from '../../../scripts/validate-puzzles';
import { verifyCampaign } from '../../../scripts/puzzle-campaign';

const position: PuzzlePosition = {
    board: { '0:0': 't-000', '1:0': 't-003', '0:1': 't-018' },
    hand: ['t-021', 't-024'],
    turnLimit: 2,
    targetScore: 12,
    ruleVersion: GAME_VERSION,
    seed: 'coin',
    drawPolicy: 'none'
};
const turns = [
    [{ x: 1, y: 1, tileId: 't-021' }],
    [{ x: -1, y: 1, tileId: 't-024' }]
];
const reference = { turns, score: 13 };
const fixture: Puzzle = { ...position, solutions: [reference], solutionHash: fnv1a64(canonicalJson(reference)), uniqueness: 'unknown' };

it('puzzle schema rejects a missing field and an unknown drawPolicy', () => {
    const { targetScore: _target, ...missing } = fixture;
    expect(validatePuzzle(fixture).ok).toBe(true);
    expect(validatePuzzle(missing).ok).toBe(false);
    expect(validatePuzzle({ ...fixture, drawPolicy: 'shuffled' }).ok).toBe(false);
    expect(validatePuzzle({ ...fixture, drawPolicy: 'ordered' }).ok).toBe(false);
    expect(validatePuzzle({ ...fixture, drawOrder: ['t-030'] }).ok).toBe(false);
});

it('solver finds the reference solution and replays it with the real engine to reach the target', () => {
    const result = solve(fixture, 1_000);
    expect(result.status).toBe('solved');
    expect(result.best).toEqual(reference);
    let state = initialPuzzleState(fixture);
    for (const placements of result.best?.turns ?? []) {
        const next = applyAction(state, { actorId: 'joueur', type: 'PLACE', actionId: String(state.turnNumber), expectedTurn: state.turnNumber, placements });
        if (!next.ok) throw new Error(next.error.detail);
        state = { ...next.state, currentPlayerIndex: 0 };
    }
    expect(state.players[0]?.score).toBe(13);
    expect(state.players[0]?.score).toBeGreaterThanOrEqual(fixture.targetScore);
    expect(() => validateReferenceSolutions(fixture)).not.toThrow();
    expect(() => validateReferenceSolutions({ ...fixture, turnLimit: 1 })).toThrow();
    expect(() => validateReferenceSolutions({ ...fixture, solutions: [{ ...reference, score: 14 }] })).toThrow();
    expect(() => validateReferenceSolutions({ ...fixture, solutionHash: '0'.repeat(16) })).toThrow();
    expect(() => validateReferenceSolutions({ ...fixture, hand: ['t-000', 't-024'] })).toThrow();
    expect(() => validateReferenceSolutions({ ...fixture, board: { ...fixture.board, '9:9': 't-090' } })).toThrow();
});

it('solver stops every winning sequence on the first turn that reaches the target', () => {
    const earlyWin: PuzzlePosition = {
        ...position, board: { '0:0': 't-000' }, hand: ['t-003', 't-006', 't-009'], targetScore: 3
    };
    const result = solve(earlyWin, 10_000);
    expect(result.status).toBe('solved');
    expect(result.solutions.length).toBeGreaterThan(0);
    for (const solution of result.solutions) {
        let state = initialPuzzleState(earlyWin);
        for (const placements of solution.turns) {
            expect(state.players[0]?.score).toBeLessThan(earlyWin.targetScore);
            const next = playPuzzleTurn(state, placements);
            if (!next) throw new Error('pose attendue');
            state = next;
        }
        expect(state.players[0]?.score).toBe(solution.score);
        expect(solution.score).toBeGreaterThanOrEqual(earlyWin.targetScore);
    }
});

it('exhausted budget gives unknown, never unsolvable', () => {
    const full = solve(position, 1_000);
    expect(full.nodes).toBeGreaterThan(2);
    expect(solve(position, 0)).toEqual({ status: 'unknown', nodes: 0, exhaustive: false, solutions: [], best: null });
    const partial = solve(position, full.nodes - 1);
    expect(partial).toMatchObject({ status: 'unknown', nodes: full.nodes - 1, exhaustive: false });
    expect(partial.solutions.length).toBeGreaterThan(0);
    expect(solve(position, full.nodes)).toMatchObject({ status: 'solved', nodes: full.nodes, exhaustive: true });
});

it('unsolvable only after an exhaustive search', () => {
    const impossible = { ...position, targetScore: 100 };
    expect(solve(impossible, 1)).toMatchObject({ status: 'unknown', exhaustive: false, nodes: 1 });
    expect(solve(impossible, 1_000)).toMatchObject({ status: 'unsolvable', exhaustive: true, solutions: [], best: null });
    expect(solve({ ...position, turnLimit: 1 }, 1_000).status).toBe('unsolvable');
});

it('uniqueness is claimed only with an exhaustive search', () => {
    const twoTile: PuzzlePosition = {
        ...position, board: { '0:0': 't-000', '1:0': 't-003', '2:0': 't-006', '3:0': 't-009' },
        hand: ['t-012', 't-015'], turnLimit: 1, targetScore: 18
    };
    // À cette extrémité du plateau, une seule permutation des deux tuiles est gagnante.
    const unique = {
        ...twoTile, targetScore: 20,
        board: { ...twoTile.board, '-1:1': 't-021', '0:1': 't-018', '3:1': 't-027', '4:1': 't-030' }
    };
    const certified = certifyCandidate(unique, 1_000);
    expect(certified?.uniqueness).toBe('unique');
    expect(certified?.solutions).toHaveLength(1);
    const complete = solve(unique, 1_000);
    const partial = solve(unique, complete.nodes - 1);
    expect(partial.exhaustive).toBe(false);
    expect(partial.solutions).toHaveLength(1);
    expect(certifyCandidate(unique, complete.nodes - 1)).toBeNull();
    expect(certifyCandidate(twoTile, 1_000)?.uniqueness).toBe('multiple');
});

it('generated puzzles start from a replayed legal state', () => {
    const seed = 'sable-0';
    const replays = vi.spyOn(engine, 'replay');
    let puzzle: Puzzle | null;
    try {
        puzzle = generate(seed);
        expect(replays).toHaveBeenCalledWith(expect.any(Object), seed, expect.any(Array));
    } finally {
        replays.mockRestore();
    }
    if (!puzzle) throw new Error('défi attendu');
    const { config, events } = playSource(seed, 12);
    expect(events).toHaveLength(12);
    expect(events.every(event => event.action.actionId.startsWith('ordi-'))).toBe(true);
    const states = events.map((_, index) => replay(config, seed, events.slice(0, index + 1)));
    expect(states.some(state => canonicalJson(state.board) === canonicalJson(puzzle.board)
        && canonicalJson(state.players[state.currentPlayerIndex]?.hand) === canonicalJson(puzzle.hand)
        && checkInvariants(state).length === 0)).toBe(true);
    expect(puzzle.board).not.toEqual(createGame(config, seed).board);
});

it('trivial and unsolvable candidates are rejected', () => {
    expect(certifyCandidate(position, 1_000)).not.toBeNull();
    expect(certifyCandidate({ ...position, targetScore: 2 }, 1_000)).toBeNull();
    expect(certifyCandidate({ ...position, targetScore: 100 }, 1_000)).toBeNull();
    expect(certifyCandidate(position, 1_000, 1)).toBeNull();
});

it('generation is deterministic for a seed', () => {
    const puzzle = generate('sable-0');
    expect(puzzle).not.toBeNull();
    expect(generate('sable-0')).toEqual(puzzle);
    expect(generate('sable-1')).not.toEqual(puzzle);
});

it('drawPolicy none never draws, ordered draws in the given order', () => {
    const first = turns[0] ?? [];
    const second = turns[1] ?? [];
    const withDraw: PuzzlePosition = { ...position, drawPolicy: 'ordered', drawOrder: ['t-030', 't-033', 't-036', 't-039', 't-042', 't-045'] };
    expect(playPuzzleTurn(initialPuzzleState(position), first)?.players[0]?.hand).toEqual(['t-024']);
    const next = playPuzzleTurn(initialPuzzleState(withDraw), first);
    if (!next) throw new Error('pose attendue');
    expect(next.players[0]?.hand).toEqual(['t-024', 't-030', 't-033', 't-036', 't-039', 't-042']);
    expect(next.bag).toEqual(['t-045']);
    const last = playPuzzleTurn(next, second);
    expect(last?.players[0]?.hand).toEqual(['t-030', 't-033', 't-036', 't-039', 't-042', 't-045']);
    expect(last?.bag).toEqual([]);
    const needsDraw: PuzzlePosition = { ...position, hand: ['t-021'], targetScore: 13, drawPolicy: 'ordered', drawOrder: ['t-024'] };
    expect(solve(needsDraw, 1_000).best).toEqual(reference);
    const ordered: Puzzle = { ...fixture, ...needsDraw };
    expect(() => validateReferenceSolutions(ordered)).not.toThrow();
    expect(() => validateReferenceSolutions({ ...ordered, drawOrder: ['t-030'] })).toThrow();
    expect(solve({ ...position, hand: ['t-021'], targetScore: 13 }, 1_000).status).toBe('unsolvable');
});

it('committed puzzles and their receipt are re-verified', () => {
    const puzzles: unknown = JSON.parse(readFileSync(new URL('../data/defis.json', import.meta.url), 'utf8'));
    const receipt: unknown = JSON.parse(readFileSync(new URL('../data/defis.recu.json', import.meta.url), 'utf8'));
    verifyCampaign(puzzles, receipt);
    if (!Array.isArray(puzzles) || !Array.isArray(receipt)) throw new Error('campagne invalide');
    const first = validatePuzzle(puzzles[0]);
    if (!first.ok) throw new Error('premier défi invalide');
    expect(() => verifyCampaign([{ ...first.value, targetScore: first.value.targetScore - 1 }, ...(puzzles as unknown[]).slice(1)], receipt)).toThrow();
    const [entry, ...rest] = receipt as unknown[];
    if (typeof entry !== 'object' || entry === null) throw new Error('reçu absent');
    expect(() => verifyCampaign(puzzles, [{ ...entry, nodes: 0 }, ...rest])).toThrow();
    expect(() => verifyCampaign(puzzles, [{ ...entry, status: 'unknown' }, ...rest])).toThrow();
    expect(() => verifyCampaign(puzzles, [{ ...entry, puzzleHash: '0'.repeat(16) }, ...rest])).toThrow();
    expect(() => verifyCampaign(puzzles.slice(1), receipt.slice(1))).toThrow();
});
