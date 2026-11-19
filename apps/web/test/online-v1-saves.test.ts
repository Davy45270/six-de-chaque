// Sauvegardes v1 produites par le code de la version publiée (tests/fixtures/v1-online, non retouchées).
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGameSnapshot } from '@six-de-chaque/contracts';
import { getLegalMoves, replay, stateHash, submit } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState } from '@six-de-chaque/engine';
import { savedResumeStatus } from '../src/game/resume';
import { getSetting, listGames, loadGame, openDb, saveTurn } from '../src/storage/db';
import { CURRENT_VERSION } from '../src/storage/migrations';
import { exportGame, importGame, parseExport } from '../src/storage/transfer';

const DIR = new URL('../../../tests/fixtures/v1-online/', import.meta.url);
const CASES = ['two-players-in-progress', 'four-players-exchanges-passes', 'finished', 'accented-names'] as const;
const FINISHED = new Set<string>(['finished']);

interface V1Export { format: string; version: 1; config: GameConfig; seed: string; snapshot: Record<string, unknown> & { version: 1; phase: string; config: { coordinateLimit: number } }; events: GameEvent[]; checksum: string }
interface V1Dump { dbName: string; dbVersion: number; stores: { games: Array<{ id: string; snapshot: V1Export['snapshot'] }>; events: Array<Record<string, unknown>>; settings: Array<{ key: string; value: unknown }> } }

const expected = new Map(readFileSync(new URL('README.md', DIR), 'utf8').split('\n')
    .map(line => /^([0-9a-f]{64}) {2}(\S+\.json)$/.exec(line)).flatMap(m => (m?.[1] && m[2] ? [[m[2], m[1]] as const] : [])));

/** Lit une fixture après contrôle de son empreinte : un fichier retouché fait échouer le test. */
function fixture(file: string): string {
    const text = readFileSync(new URL(file, DIR), 'utf8');
    expect(createHash('sha256').update(text).digest('hex'), file).toBe(expected.get(file));
    return text;
}

/** Ce que la nouvelle version doit garder d'un instantané v1 : tout, sauf le numéro de version. */
const sameGame = (state: GameState, v1: V1Export['snapshot'], name: string): void => {
    expect({ ...state, version: 1 }, name).toEqual(v1);
};

let n = 0;
const freshDb = (): Promise<IDBDatabase> => openDb(`online-v1-${++n}`);

async function loadDump(dump: V1Dump): Promise<IDBDatabase> {
    expect(dump.dbName).toBe('six-de-chaque');
    expect(dump.dbVersion).toBe(1);
    const db = await freshDb();
    const tx = db.transaction(['games', 'events', 'settings'], 'readwrite');
    for (const g of dump.stores.games) tx.objectStore('games').put(g);
    for (const e of dump.stores.events) tx.objectStore('events').put(e);
    for (const s of dump.stores.settings) tx.objectStore('settings').put(s.value, s.key);
    await new Promise<void>((ok, ko) => { tx.oncomplete = () => { ok(); }; tx.onerror = () => { ko(tx.error ?? new Error('écriture')); }; });
    return db;
}

describe('online v1 saves', () => {
    it('every export produced by the online version imports into this version unchanged', async () => {
        for (const name of CASES) {
            const json = fixture(`${name}.export.json`);
            const v1 = JSON.parse(json) as V1Export;
            expect(v1.version, name).toBe(1);
            const parsed = parseExport(json);
            expect(parsed, name).toMatchObject({ ok: true });
            if (!parsed.ok) continue;
            sameGame(parsed.save.snapshot, v1.snapshot, name);
            expect(parsed.save.config, name).toEqual(v1.config);
            expect(parsed.save.events.map(e => e.action), name).toEqual(v1.events.map(e => e.action));
            expect(parsed.save.events.map(e => e.score), name).toEqual(v1.events.map(e => e.score));
            expect(stateHash(replay(parsed.save.config, parsed.save.seed, parsed.save.events)), name).toBe(stateHash(parsed.save.snapshot));

            const db = await freshDb();
            const imported = await importGame(db, json, () => `import-${name}`);
            expect(imported, name).toEqual({ ok: true, gameId: `import-${name}` });
            const loaded = await loadGame(db, `import-${name}`);
            expect(loaded.consistent, name).toBe(true);
            sameGame(loaded.session.state, v1.snapshot, name);
            const again = parseExport(await exportGame(db, `import-${name}`));
            expect(again, name).toMatchObject({ ok: true, save: { version: CURRENT_VERSION } });
            if (again.ok) sameGame(again.save.snapshot, v1.snapshot, name);
        }
    });

    it('every IndexedDB save produced by the online version loads and resumes in this version', async () => {
        for (const name of CASES) {
            const dump = JSON.parse(fixture(`${name}.indexeddb.json`)) as V1Dump;
            const v1 = dump.stores.games[0];
            if (!v1) throw new Error(`${name} : aucune partie`);
            const db = await loadDump(dump);
            const settings = new Map(dump.stores.settings.map(s => [s.key, s.value]));

            // Parcours de démarrage de l'application : dernière partie, liste, chargement, offre de reprise.
            const last = await getSetting<string>(db, 'lastGameId');
            expect(last, name).toBe(v1.id);
            const games = await listGames(db);
            expect(games, name).toEqual([{ id: v1.id, updatedTurn: v1.snapshot.turnNumber, finished: FINISHED.has(name) }]);
            const loaded = await loadGame(db, v1.id);
            expect(loaded.consistent, name).toBe(true);
            sameGame(loaded.session.state, v1.snapshot, name);
            const offered = games.find(g => g.id === last && !g.finished);
            const status = savedResumeStatus(v1.id, loaded);
            if (FINISHED.has(name)) {
                expect(offered, name).toBeUndefined();
                expect(status, name).toEqual({ resume: null, message: null });
            } else {
                expect(offered?.id, name).toBe(v1.id);
                expect(status, name).toEqual({ resume: { id: v1.id, note: null }, message: null });

                // Un coup légal joué puis sauvegardé se relit.
                const state = loaded.session.state;
                const player = state.players[state.currentPlayerIndex];
                const move = player && getLegalMoves(state, player.id, 1)[0];
                if (!player || !move) throw new Error(`${name} : aucun coup légal`);
                const next = submit(loaded.session, { type: 'PLACE', actorId: player.id, expectedTurn: state.turnNumber, actionId: `suite-${name}`, placements: move.placements });
                expect(next.result.ok, name).toBe(true);
                await saveTurn(db, v1.id, next.session, loaded.config);
                const reread = await loadGame(db, v1.id);
                expect(reread.consistent, name).toBe(true);
                expect(reread.session, name).toEqual(next.session);
            }

            // Réglages conservés ; la v1 n'avait ni défis ni lettres de couleur.
            expect(await getSetting(db, 'highContrast'), name).toBe(settings.get('highContrast'));
            expect(await getSetting(db, 'completedChallenges'), name).toBeUndefined();
            expect(await getSetting(db, 'colourBlind'), name).toBeUndefined();
            db.close();
        }
    });

    it('a v1 save with the default coordinate limit is never refused by the 100 000 cap', async () => {
        for (const name of CASES) {
            const json = fixture(`${name}.export.json`);
            const v1 = JSON.parse(json) as V1Export;
            expect(v1.snapshot.config.coordinateLimit, name).toBe(100_000);
            const parsed = parseExport(json);
            expect(parsed, name).toMatchObject({ ok: true, save: { snapshot: { config: { coordinateLimit: 100_000 } } } });
            if (parsed.ok) expect(validateGameSnapshot(parsed.save.snapshot).ok, name).toBe(true);

            const dump = JSON.parse(fixture(`${name}.indexeddb.json`)) as V1Dump;
            const db = await loadDump(dump);
            const id = dump.stores.games[0]?.id ?? '';
            await expect(loadGame(db, id), name).resolves.toMatchObject({ consistent: true, session: { state: { config: { coordinateLimit: 100_000 } } } });
            db.close();
        }
    });
});
