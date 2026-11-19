import { canonicalJson, fnv1a64, replay } from '@six-de-chaque/engine';
import { DEFAULT_BUDGET_NODES, generate, MAX_SOLUTIONS, playSource, solutionHash, solve } from '@six-de-chaque/puzzles';
import type { Puzzle, SolveResult } from '@six-de-chaque/puzzles';
import { validateReferenceSolutions } from './validate-puzzles';

const PER_TIER = 4;
const SOURCE_TURN = 5;
const CAMPAIGN_SEEDS = [
    { turnLimit: 1, seeds: ['rivage-1-3', 'rivage-1-5', 'rivage-1-2', 'rivage-1-4'] },
    { turnLimit: 2, seeds: ['rivage-2-4', 'rivage-2-15', 'rivage-2-9', 'rivage-2-12'] },
    { turnLimit: 3, seeds: ['rivage-3-41', 'rivage-3-45', 'rivage-3-44', 'rivage-3-6'] }
];
const campaignTurns = new Map(CAMPAIGN_SEEDS.flatMap(({ turnLimit, seeds }) => seeds.map(seed => [seed, turnLimit] as const)));
const CAMPAIGN_SIZE = CAMPAIGN_SEEDS.length * PER_TIER;

interface ReceiptEntry {
    seed: string;
    ruleVersion: Puzzle['ruleVersion'];
    puzzleHash: string;
    status: SolveResult['status'];
    nodes: number;
    solutionHash: string;
    solutionCount: number;
    tier: 1 | 2 | 3;
}

const measure = (nodes: number, solutions: number): number => Math.ceil(nodes / solutions);

function receiptFor(puzzle: Puzzle, result: SolveResult): ReceiptEntry {
    const effort = measure(result.nodes, result.solutions.length);
    return {
        seed: puzzle.seed,
        ruleVersion: puzzle.ruleVersion,
        puzzleHash: fnv1a64(canonicalJson(puzzle)),
        status: result.status,
        nodes: result.nodes,
        solutionHash: puzzle.solutionHash,
        solutionCount: result.solutions.length,
        tier: effort < 50 ? 1 : effort < 400 ? 2 : 3
    };
}

function certifyCampaignPuzzle(puzzle: Puzzle): ReceiptEntry {
    const result = solve(puzzle, DEFAULT_BUDGET_NODES);
    if (result.status !== 'solved' || !result.exhaustive || !result.best) throw new Error(`défi sans preuve : ${puzzle.seed}`);
    if (puzzle.targetScore !== result.best.score || canonicalJson(result.solutions) !== canonicalJson(puzzle.solutions)
        || solutionHash(result.best) !== puzzle.solutionHash
        || puzzle.uniqueness !== (result.solutions.length === 1 ? 'unique' : 'multiple')
        || result.solutions.length > MAX_SOLUTIONS || result.solutions.some(s => s.turns.length === 1 && s.turns[0]?.length === 1)) {
        throw new Error(`certificat de solution invalide : ${puzzle.seed}`);
    }
    return receiptFor(puzzle, result);
}

export function verifyCampaign(puzzles: unknown, receipt: unknown): void {
    if (!Array.isArray(puzzles) || puzzles.length !== CAMPAIGN_SIZE || !Array.isArray(receipt) || receipt.length !== CAMPAIGN_SIZE) {
        throw new Error('taille de campagne invalide');
    }
    const seeds = new Set<string>();
    let previousEffort = 0;
    for (const [index, value] of puzzles.entries()) {
        const puzzle = validateReferenceSolutions(value);
        if (campaignTurns.get(puzzle.seed) !== puzzle.turnLimit || puzzle.drawPolicy !== 'none') {
            throw new Error(`paramètres de campagne invalides : ${puzzle.seed}`);
        }
        const { config, events } = playSource(puzzle.seed, SOURCE_TURN);
        const source = replay(config, puzzle.seed, events);
        if (source.turnNumber !== SOURCE_TURN || canonicalJson(source.board) !== canonicalJson(puzzle.board)
            || canonicalJson(source.players[source.currentPlayerIndex]?.hand) !== canonicalJson(puzzle.hand)) {
            throw new Error(`position de campagne différente du rejeu : ${puzzle.seed}`);
        }
        const expected = certifyCampaignPuzzle(puzzle);
        const effort = measure(expected.nodes, expected.solutionCount);
        if (seeds.has(puzzle.seed) || effort < previousEffort || expected.tier !== 1 + Math.floor(index / PER_TIER)
            || canonicalJson(expected) !== canonicalJson(receipt[index])) {
            throw new Error(`reçu ou ordre de campagne invalide : ${puzzle.seed}`);
        }
        seeds.add(puzzle.seed);
        previousEffort = effort;
    }
}

export function generateCampaign(): { puzzles: Puzzle[]; receipt: ReceiptEntry[] } {
    const entries = CAMPAIGN_SEEDS.flatMap(({ turnLimit, seeds }) => seeds.map(seed => {
        const puzzle = generate(seed, { turnLimit, startTurn: SOURCE_TURN, attempts: 1 });
        if (!puzzle) throw new Error(`graine de campagne refusée : ${seed}`);
        return { puzzle, receipt: certifyCampaignPuzzle(puzzle) };
    }));
    entries.sort((a, b) => measure(a.receipt.nodes, a.receipt.solutionCount) - measure(b.receipt.nodes, b.receipt.solutionCount));
    return { puzzles: entries.map(e => e.puzzle), receipt: entries.map(e => e.receipt) };
}
