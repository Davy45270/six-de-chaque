// Score sans double comptage : segments maximaux (longueur ≥ 2) contenant une tuile posée, dédoublonnés.
import { cellKey, MAX_LINE, segmentAt } from './lines';
import type { Placement, TileId } from './types';

export interface Segment { axis: 'h' | 'v'; startX: number; startY: number; endX: number; endY: number; length: number }
export interface ScoreBreakdown { segments: Segment[]; base: number; bonuses: number; total: number }
export const LINE_BONUS = 6;

export function calculateScore(boardBefore: Readonly<Record<string, TileId>>, placements: readonly Placement[]): ScoreBreakdown {
    const added = new Set(placements.map(p => cellKey(p.x, p.y)));
    const occupied = (x: number, y: number): boolean => added.has(cellKey(x, y)) || boardBefore[cellKey(x, y)] !== undefined;
    const byKey = new Map<string, Segment>();
    for (const p of placements) {
        for (const axis of ['h', 'v'] as const) {
            const cells = segmentAt(occupied, p.x, p.y, axis);
            if (cells.length < 2) continue;
            const start = cells[0] as { x: number; y: number };
            const end = cells[cells.length - 1] as { x: number; y: number };
            const segment: Segment = { axis, startX: start.x, startY: start.y, endX: end.x, endY: end.y, length: cells.length };
            byKey.set(`${axis}:${start.x}:${start.y}:${end.x}:${end.y}`, segment);
        }
    }
    const segments = [...byKey.values()];
    if (segments.length === 0) return { segments, base: placements.length > 0 ? 1 : 0, bonuses: 0, total: placements.length > 0 ? 1 : 0 };
    const base = segments.reduce((sum, s) => sum + s.length, 0);
    const bonuses = segments.filter(s => s.length === MAX_LINE).length * LINE_BONUS;
    return { segments, base, bonuses, total: base + bonuses };
}
