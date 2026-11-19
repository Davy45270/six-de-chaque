// Export et import après vérification de l'instantané et du journal.
import { stateHash } from '@six-de-chaque/engine';
import { loadGame, saveAll } from './db';
import { CURRENT_VERSION, migrateSave, SaveError } from './migrations';
import type { CurrentSave } from './migrations';

export const SAVE_FORMAT = 'six-de-chaque-save';
export interface ExportedGame extends CurrentSave { format: typeof SAVE_FORMAT; seed: string }

export async function exportGame(db: IDBDatabase, gameId: string): Promise<string> {
    const { session, config, consistent } = await loadGame(db, gameId);
    if (!consistent) throw new SaveError('Le journal des coups ne redonne pas cette partie.');
    const out: ExportedGame = { format: SAVE_FORMAT, version: CURRENT_VERSION, config, seed: session.state.seed, snapshot: session.state, events: session.events, checksum: stateHash(session.state) };
    return JSON.stringify(out);
}

/** Vérifie une sauvegarde exportée sans rien écrire ; rend la partie ou la raison du refus. */
export function parseExport(json: string): { ok: true; save: ExportedGame } | { ok: false; reason: string } {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return { ok: false, reason: 'Le fichier n’est pas du JSON lisible.' }; }
    const save = raw as { format?: unknown; seed?: unknown; version?: unknown; config?: unknown; snapshot?: unknown; events?: unknown; checksum?: unknown } | null;
    if (!save || typeof save !== 'object' || save.format !== SAVE_FORMAT) return { ok: false, reason: 'Ce fichier n’est pas une sauvegarde de Six de chaque.' };
    try {
        const migrated = migrateSave(save);
        if (save.seed !== migrated.snapshot.seed) return { ok: false, reason: 'La graine ne correspond pas à la partie.' };
        return { ok: true, save: { ...migrated, format: SAVE_FORMAT, seed: migrated.snapshot.seed } };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Sauvegarde invalide.' };
    }
}

export async function importGame(db: IDBDatabase, json: string, newId: () => string = () => `partie-${crypto.randomUUID()}`): Promise<{ ok: true; gameId: string } | { ok: false; reason: string }> {
    const parsed = parseExport(json);
    if (!parsed.ok) return parsed;
    const gameId = newId();
    await saveAll(db, gameId, { state: parsed.save.snapshot, events: parsed.save.events }, parsed.save.config);
    return { ok: true, gameId };
}
