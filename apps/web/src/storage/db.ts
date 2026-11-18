// IndexedDB : stores `games` (instantané, version, empreinte), `events` (journal chaîné, clé [gameId, seq]),
// `settings`. Un tour validé = une transaction (instantané + nouvel événement).
import { replay, stateHash } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState, Session } from '@six-de-chaque/engine';
import { migrate } from './migrations';

export interface SavedGame { id: string; config: GameConfig; snapshot: GameState; version: 1; checksum: string; updatedTurn: number }
export type SettingKey = 'highContrast' | 'lastGameId';
type StoredEvent = GameEvent & { gameId: string };

export const DB_NAME = 'six-de-chaque';
const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => { resolve(r.result); }; r.onerror = () => { reject(r.error ?? new Error('IndexedDB')); }; });
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error('transaction')); };
    tx.onabort = () => { reject(tx.error ?? new Error('transaction annulée')); };
});

export function openDb(name = DB_NAME): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => {
            const db = open.result;
            db.createObjectStore('games', { keyPath: 'id' });
            db.createObjectStore('events', { keyPath: ['gameId', 'seq'] });
            db.createObjectStore('settings');
        };
        open.onsuccess = () => { resolve(open.result); };
        open.onerror = () => { reject(open.error ?? new Error('IndexedDB indisponible')); };
    });
}

const record = (gameId: string, session: Session, config: GameConfig): SavedGame =>
    ({ id: gameId, config, snapshot: session.state, version: 1, checksum: stateHash(session.state), updatedTurn: session.state.turnNumber });

export async function saveTurn(db: IDBDatabase, gameId: string, session: Session, config: GameConfig): Promise<void> {
    const tx = db.transaction(['games', 'events'], 'readwrite');
    tx.objectStore('games').put(record(gameId, session, config));
    const last = session.events[session.events.length - 1];
    if (last) tx.objectStore('events').put({ ...last, gameId } satisfies StoredEvent);
    await done(tx);
}

/** Écrit une partie complète (nouvelle partie, import). */
export async function saveAll(db: IDBDatabase, gameId: string, session: Session, config: GameConfig): Promise<void> {
    const tx = db.transaction(['games', 'events'], 'readwrite');
    tx.objectStore('games').put(record(gameId, session, config));
    const events = tx.objectStore('events');
    for (const e of session.events) events.put({ ...e, gameId } satisfies StoredEvent);
    await done(tx);
}

async function eventsOf(db: IDBDatabase, gameId: string): Promise<GameEvent[]> {
    const tx = db.transaction('events', 'readonly');
    const rows = await req(tx.objectStore('events').getAll(IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER])) as IDBRequest<StoredEvent[]>);
    return rows.sort((a, b) => a.seq - b.seq).map(({ gameId: _g, ...e }) => e);
}

/** Vrai si le rejeu du journal redonne exactement l'instantané et son empreinte. */
export function isConsistent(config: GameConfig, snapshot: GameState, events: readonly GameEvent[], checksum: string): boolean {
    try {
        const h = stateHash(snapshot);
        return h === checksum && stateHash(replay(config, snapshot.seed, events)) === h;
    } catch { return false; }
}

export async function loadGame(db: IDBDatabase, gameId: string): Promise<{ session: Session; config: GameConfig; consistent: boolean }> {
    const tx = db.transaction('games', 'readonly');
    const saved = await req(tx.objectStore('games').get(gameId) as IDBRequest<SavedGame | undefined>);
    if (!saved) throw new Error(`partie introuvable : ${gameId}`);
    const events = await eventsOf(db, gameId);
    const state = migrate(saved.snapshot);
    return { session: { state, events }, config: saved.config, consistent: isConsistent(saved.config, state, events, saved.checksum) };
}

export async function listGames(db: IDBDatabase): Promise<Array<Pick<SavedGame, 'id' | 'updatedTurn'> & { finished: boolean }>> {
    const tx = db.transaction('games', 'readonly');
    const all = await req(tx.objectStore('games').getAll() as IDBRequest<SavedGame[]>);
    return all.map(g => ({ id: g.id, updatedTurn: g.updatedTurn, finished: g.snapshot.phase === 'finished' }));
}

export async function deleteGame(db: IDBDatabase, gameId: string): Promise<void> {
    const tx = db.transaction(['games', 'events'], 'readwrite');
    tx.objectStore('games').delete(gameId);
    tx.objectStore('events').delete(IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER]));
    await done(tx);
}

export async function getSetting<T>(db: IDBDatabase, key: SettingKey): Promise<T | undefined> {
    const tx = db.transaction('settings', 'readonly');
    return req(tx.objectStore('settings').get(key) as IDBRequest<T | undefined>);
}
export async function setSetting(db: IDBDatabase, key: SettingKey, value: unknown): Promise<void> {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, key);
    await done(tx);
}
