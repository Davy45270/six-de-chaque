// Migrations explicites des instantanés : table version → fonction. Seule la v1 existe ; une version inconnue lève.
import { validateGameSnapshot } from '@six-de-chaque/contracts';
import type { GameState } from '@six-de-chaque/engine';

export class SaveError extends Error {}
const MIGRATIONS: Record<number, (raw: unknown) => unknown> = { 1: raw => raw };
export const CURRENT_VERSION = 1;

export function migrate(raw: unknown): GameState {
    const version = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined;
    const step = typeof version === 'number' ? MIGRATIONS[version] : undefined;
    if (!step) throw new SaveError(`version de sauvegarde inconnue : ${String(version)}`);
    const checked = validateGameSnapshot(step(raw));
    if (!checked.ok) throw new SaveError(`sauvegarde invalide : ${checked.errors.slice(0, 3).join(' ; ')}`);
    return checked.value;
}
