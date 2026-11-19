// IndexedDB : stores `games` (instantané, version, empreinte), `events` (journal chaîné, clé [gameId, seq]),
// `settings`. Un tour validé = une transaction (instantané + nouvel événement).
import { replay, stateHash } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState, Session } from '@six-de-chaque/engine';
import { checkedConfig, CURRENT_VERSION, migrate, migrateSave, SaveError, selectEventFields } from './migrations';

export interface SavedGame { id: string; config: GameConfig; snapshot: GameState; version: typeof CURRENT_VERSION; checksum: string; updatedTurn: number }
type StoredGame = Omit<SavedGame, 'version' | 'snapshot'> & { version: unknown; snapshot: unknown };
export type SettingKey = 'highContrast' | 'colourBlind' | 'lastGameId' | 'completedChallenges';
type StoredEvent = GameEvent & { gameId: string };

export const DB_NAME = 'six-de-chaque';
const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => { resolve(r.result); }; r.onerror = () => { reject(r.error ?? new Error('IndexedDB')); }; });
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    tx.oncomplete = () => { resolve(); };
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
    ({ id: gameId, config: checkedConfig(config, CURRENT_VERSION), snapshot: session.state, version: CURRENT_VERSION, checksum: stateHash(session.state), updatedTurn: session.state.turnNumber });

export class StaleGameError extends Error {
    constructor() {
        super('Cette partie a été jouée dans un autre onglet ; rechargez pour reprendre.');
        this.name = 'StaleGameError';
    }
}

export async function saveTurn(db: IDBDatabase, gameId: string, session: Session, config: GameConfig, savedState: GameState): Promise<void> {
    const previousChecksum = stateHash(savedState);
    const next = record(gameId, session, config);
    const finished = session.state.phase === 'finished';
    const tx = db.transaction(finished ? ['games', 'events', 'settings'] : ['games', 'events'], 'readwrite');
    const games = tx.objectStore('games');
    const stored = await req(games.get(gameId) as IDBRequest<StoredGame | undefined>);
    if (stored && stored.checksum !== previousChecksum) {
        throw new StaleGameError();
    }

    const journal = tx.objectStore('events');
    const previousSeq = savedState.turnNumber - 1;
    if (stored && previousSeq >= 0) {
        const head = await req(journal.get([gameId, previousSeq]) as IDBRequest<StoredEvent | undefined>);
        if (!head || head.hash !== session.events[previousSeq]?.hash) {
            throw new StaleGameError();
        }
    }

    games.put(next);
    if (stored) {
        // Inclut les tours restés en mémoire après un échec d’écriture.
        for (const event of session.events.slice(savedState.turnNumber)) {
            journal.add({ ...event, gameId } satisfies StoredEvent);
        }
    } else {
        journal.delete(IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER]));
        for (const event of session.events) {
            journal.put({ ...event, gameId } satisfies StoredEvent);
        }
    }
    if (finished) {
        const settings = tx.objectStore('settings');
        const lastGameId = settings.get('lastGameId') as IDBRequest<string | undefined>;
        lastGameId.onsuccess = () => {
            if (lastGameId.result === gameId) settings.delete('lastGameId');
        };
    }
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

/** Vrai si le rejeu du journal redonne exactement l'instantané et son empreinte. */
export function isConsistent(config: GameConfig, snapshot: GameState, events: readonly GameEvent[], checksum: string): boolean {
    try {
        const h = stateHash(snapshot);
        return h === checksum && stateHash(replay(config, snapshot.seed, events)) === h;
    } catch { return false; }
}

export interface LoadedGame { session: Session; config: GameConfig; consistent: boolean; recovered?: boolean }

export async function loadGame(db: IDBDatabase, gameId: string, mode: 'inspect' | 'preview' | 'resume' = 'inspect'): Promise<LoadedGame> {
    const tx = db.transaction(['games', 'events'], mode === 'preview' ? 'readonly' : 'readwrite');
    const games = tx.objectStore('games');
    const journal = tx.objectStore('events');
    const [saved, rows] = await Promise.all([
        req(games.get(gameId) as IDBRequest<StoredGame | undefined>),
        req(journal.getAll(IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER])) as IDBRequest<StoredEvent[]>)
    ]);
    if (!saved) throw new Error(`partie introuvable : ${gameId}`);
    if (saved.version !== CURRENT_VERSION) {
        const migrated = migrateSave({ ...saved, events: rows });
        const session = { state: migrated.snapshot, events: migrated.events };
        if (mode !== 'preview') {
            games.put(record(gameId, session, migrated.config));
            for (const event of migrated.events) journal.put({ ...event, gameId } satisfies StoredEvent);
            await done(tx);
        }
        return { session, config: migrated.config, consistent: true };
    }
    if (!saved.snapshot || typeof saved.snapshot !== 'object' || !('version' in saved.snapshot) || saved.snapshot.version !== CURRENT_VERSION) throw new SaveError('Versions de la sauvegarde et de la partie différentes.');
    const state = migrate(saved.snapshot);
    const events = rows.map(selectEventFields);
    const loaded = { session: { state, events }, config: saved.config, consistent: false };
    if (mode === 'inspect') return { ...loaded, consistent: isConsistent(saved.config, state, events, saved.checksum) };

    let recovered: LoadedGame;
    try {
        const config = checkedConfig(saved.config, CURRENT_VERSION);
        const replayed = replay(config, state.seed, events);
        const hash = stateHash(replayed);
        if (stateHash(state) === saved.checksum) return { ...loaded, config, consistent: hash === saved.checksum };
        if (hash !== saved.checksum) return loaded;
        recovered = { session: { state: replayed, events }, config, consistent: true, recovered: true };
    } catch {
        return loaded;
    }
    if (mode === 'resume') {
        games.put(record(gameId, recovered.session, recovered.config));
        await done(tx);
    }
    return recovered;
}

export async function listGames(db: IDBDatabase): Promise<Array<Pick<SavedGame, 'id' | 'updatedTurn'> & { finished: boolean }>> {
    const tx = db.transaction('games', 'readonly');
    const all = await req(tx.objectStore('games').getAll() as IDBRequest<StoredGame[]>);
    return all.map(({ id, updatedTurn, snapshot }) => ({
        id, updatedTurn,
        finished: !!snapshot && typeof snapshot === 'object' && 'phase' in snapshot && snapshot.phase === 'finished'
    }));
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

export async function completeChallenge(db: IDBDatabase, id: string): Promise<void> {
    const tx = db.transaction('settings', 'readwrite');
    const settings = tx.objectStore('settings');
    const completed = await req(settings.get('completedChallenges') as IDBRequest<string[] | undefined>);
    settings.put([...new Set([...(completed ?? []), id])], 'completedChallenges');
    await done(tx);
}
