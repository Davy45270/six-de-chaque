import { canonicalJson, fnv1a64, getLegalMoves } from '@six-de-chaque/engine';
import type { GameState, Placement } from '@six-de-chaque/engine';
import type { PuzzlePosition, PuzzleSolution } from '@six-de-chaque/contracts';
import { initialPuzzleState, playPuzzleTurn } from './position';

export interface SolveResult {
    status: 'solved' | 'unsolvable' | 'unknown';
    solutions: PuzzleSolution[];
    best: PuzzleSolution | null;
    nodes: number;
    exhaustive: boolean;
}

export const solutionHash = (solution: PuzzleSolution): string => fnv1a64(canonicalJson(solution));

/** Explore toutes les séquences de poses, y compris les prolongements après avoir atteint l'objectif. */
export function solve(puzzle: PuzzlePosition, budgetNodes: number): SolveResult {
    const budget = Number.isNaN(budgetNodes) ? 0 : Math.max(0, Math.floor(budgetNodes));
    const solutions: PuzzleSolution[] = [];
    let nodes = 0;

    function visit(state: GameState, turns: Placement[][]): boolean {
        nodes++;
        const score = state.players[0]?.score ?? 0;
        if (turns.length > 0 && score >= puzzle.targetScore) solutions.push({ turns, score });
        if (state.phase === 'finished' || turns.length >= puzzle.turnLimit) return true;

        // Un coup supplémentaire suffit pour constater qu'il reste un nœud à explorer.
        for (const move of getLegalMoves(state, 'joueur', budget - nodes + 1)) {
            if (nodes >= budget) return false;
            const placements = [...move.placements].sort((a, b) => a.x - b.x || a.y - b.y);
            const next = playPuzzleTurn(state, placements);
            if (!next) throw new Error('pose générée refusée par le moteur');
            if (!visit(next, [...turns, placements])) return false;
        }
        return true;
    }

    const exhaustive = budget > 0 && visit(initialPuzzleState(puzzle), []);
    const ranked = solutions.map(solution => ({ solution, key: canonicalJson(solution.turns) }));
    ranked.sort((a, b) => b.solution.score - a.solution.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const ordered = ranked.map(entry => entry.solution);
    const best = ordered[0] ?? null;
    const status = !exhaustive ? 'unknown' : best ? 'solved' : 'unsolvable';
    return { status, solutions: ordered, best, nodes, exhaustive };
}
