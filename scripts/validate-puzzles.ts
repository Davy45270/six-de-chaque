import { validatePuzzle } from '@six-de-chaque/contracts';
import type { Puzzle, PuzzleSolution } from '@six-de-chaque/contracts';
import { ALL_TILES, applyAction, boardLookup, canonicalJson, cellKey, checkInvariants, fnv1a64, isValidLine, moveKey, parseKey, segmentAt, STEP } from '@six-de-chaque/engine';
import type { GameState, TileId } from '@six-de-chaque/engine';
import { initialPuzzleState } from '../packages/puzzles/src/position';

function checkInventory(state: GameState, setAside: TileId[]): void {
    const active = [...Object.values(state.board), ...state.players.flatMap(player => player.hand), ...state.bag];
    // Réintégrer les tuiles écartées pour le contrôle de conservation du moteur.
    const errors = checkInvariants({ ...state, bag: [...state.bag, ...setAside] });
    if (active.length + setAside.length !== ALL_TILES.length || errors.length) {
        throw new Error(`inventaire du défi invalide : ${errors.join(', ')}`);
    }
}

function checkBoard(state: GameState): void {
    const keys = Object.keys(state.board);
    const first = keys[0];
    if (first === undefined) return;
    const at = boardLookup(state.board);
    const occupied = (x: number, y: number) => at(x, y) !== undefined;
    const visited = new Set([first]);
    const pending = [first];
    for (const key of pending) {
        const { x, y } = parseKey(key);
        for (const axis of ['h', 'v'] as const) {
            const [dx, dy] = STEP[axis];
            if (!occupied(x - dx, y - dy)) {
                const tiles = segmentAt(occupied, x, y, axis).map(cell => state.tilesById[state.board[cellKey(cell.x, cell.y)] ?? '']);
                if (!isValidLine(tiles.filter(tile => tile !== undefined))) throw new Error(`ligne invalide en ${key}`);
            }
            for (const sign of [-1, 1]) {
                const neighbor = cellKey(x + dx * sign, y + dy * sign);
                if (state.board[neighbor] !== undefined && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    pending.push(neighbor);
                }
            }
        }
    }
    if (visited.size !== keys.length) throw new Error('plateau disjoint');
}

export function validateReferenceSolutions(value: unknown): Puzzle {
    const checked = validatePuzzle(value);
    if (!checked.ok) throw new Error(checked.errors.join('\n'));
    const puzzle = checked.value;
    const initial = initialPuzzleState(puzzle);
    const active = new Set([...Object.values(puzzle.board), ...puzzle.hand, ...initial.bag]);
    const setAside = ALL_TILES.map(tile => tile.id).filter(id => !active.has(id));
    checkInventory(initial, setAside);
    checkBoard(initial);

    const sequences = new Set<string>();
    let best: PuzzleSolution | undefined;
    for (const solution of puzzle.solutions) {
        if (solution.turns.length > puzzle.turnLimit) throw new Error('solution trop longue');
        let state = initial;
        for (const placements of solution.turns) {
            const result = applyAction(state, {
                type: 'PLACE', actorId: 'joueur', expectedTurn: state.turnNumber, actionId: `rejeu-${state.turnNumber}`, placements
            });
            if (!result.ok) throw new Error(result.error.detail);
            state = { ...result.state, currentPlayerIndex: 0 };
            checkInventory(state, setAside);
        }
        const score = state.players[0]?.score ?? 0;
        if (score !== solution.score || score < puzzle.targetScore) throw new Error('score de référence invalide');
        const sequence = canonicalJson(solution.turns.map(turn => moveKey(initial, turn)));
        if (sequences.has(sequence)) throw new Error('solution de référence en double');
        sequences.add(sequence);
        if (!best || score > best.score || (score === best.score && canonicalJson(solution.turns) < canonicalJson(best.turns))) best = solution;
    }
    if (!best || fnv1a64(canonicalJson(best)) !== puzzle.solutionHash) throw new Error('empreinte de solution invalide');
    if (puzzle.uniqueness === 'unique' && sequences.size !== 1) throw new Error('solutions incompatibles avec une solution unique');
    return puzzle;
}
