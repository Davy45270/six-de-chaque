import type { GAME_VERSION, Placement, TileId } from '@six-de-chaque/engine/types';

export type DrawPolicy = { drawPolicy: 'none'; drawOrder?: never } | { drawPolicy: 'ordered'; drawOrder: TileId[] };

export type PuzzlePosition = DrawPolicy & {
    board: Record<string, TileId>;
    hand: TileId[];
    turnLimit: number;
    targetScore: number;
    ruleVersion: typeof GAME_VERSION;
    seed: string;
};

/** Les tours sont des poses successives du même joueur, avec un score initial nul. */
export interface PuzzleSolution {
    turns: Placement[][];
    score: number;
}

export type Puzzle = PuzzlePosition & {
    solutions: PuzzleSolution[];
    solutionHash: string;
    uniqueness: 'unique' | 'unknown' | 'multiple';
};
