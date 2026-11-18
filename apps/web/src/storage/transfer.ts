// Export et import d'une partie. Import : JSON → schéma → invariants → rejeu et chaîne d'empreintes → écriture
// sous un NOUVEL identifiant. Aucune écriture si une étape échoue.
import { validateGameAction } from '@six-de-chaque/contracts';
import { checkInvariants, stateHash } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState } from '@six-de-chaque/engine';
import { isConsistent, loadGame, saveAll } from './db';
import { migrate } from './migrations';

export const SAVE_FORMAT = 'six-de-chaque-save';
export interface ExportedGame { format: typeof SAVE_FORMAT; version: 1; config: GameConfig; seed: string; snapshot: GameState; events: GameEvent[]; checksum: string }

export async function exportGame(db: IDBDatabase, gameId: string): Promise<string> {
    const { session, config } = await loadGame(db, gameId);
    const out: ExportedGame = { format: SAVE_FORMAT, version: 1, config, seed: session.state.seed, snapshot: session.state, events: session.events, checksum: stateHash(session.state) };
    return JSON.stringify(out);
}

/** Vérifie une sauvegarde exportée sans rien écrire ; rend la partie ou la raison du refus. */
export function parseExport(json: string): { ok: true; save: ExportedGame } | { ok: false; reason: string } {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return { ok: false, reason: 'Le fichier n’est pas du JSON lisible.' }; }
    const save = raw as Partial<ExportedGame> | null;
    if (!save || typeof save !== 'object' || save.format !== SAVE_FORMAT) return { ok: false, reason: 'Ce fichier n’est pas une sauvegarde de Six de chaque.' };
    if (save.version !== 1) return { ok: false, reason: `Version de sauvegarde inconnue : ${String(save.version)}.` };
    let snapshot: GameState;
    try { snapshot = migrate(save.snapshot); } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : 'Sauvegarde invalide.' }; }
    const problems = checkInvariants(snapshot);
    if (problems.length) return { ok: false, reason: `Partie incohérente : ${problems[0] ?? ''}.` };
    if (!Array.isArray(save.events) || !save.config || !Array.isArray(save.config.players) || typeof save.checksum !== 'string') return { ok: false, reason: 'Sauvegarde incomplète.' };
    if (save.events.some(e => typeof e !== 'object' || !validateGameAction(e.action).ok)) return { ok: false, reason: 'Journal des coups invalide.' };
    if (save.seed !== snapshot.seed) return { ok: false, reason: 'La graine ne correspond pas à la partie.' };
    if (!isConsistent(save.config, snapshot, save.events, save.checksum)) return { ok: false, reason: 'Le journal des coups ne redonne pas cette partie (empreintes différentes).' };
    return { ok: true, save: { ...(save as ExportedGame), snapshot } };
}

export async function importGame(db: IDBDatabase, json: string, newId: () => string = () => `partie-${crypto.randomUUID()}`): Promise<{ ok: true; gameId: string } | { ok: false; reason: string }> {
    const parsed = parseExport(json);
    if (!parsed.ok) return parsed;
    const gameId = newId();
    await saveAll(db, gameId, { state: parsed.save.snapshot, events: parsed.save.events }, parsed.save.config);
    return { ok: true, gameId };
}
