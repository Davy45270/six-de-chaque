// Conflits d'écriture IndexedDB : deux onglets qui divergent au même tour, échec du journal dans la transaction.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getLegalMoves, stateHash, submit } from '@six-de-chaque/engine';
import type { GameAction, Session } from '@six-de-chaque/engine';
import { loadGame, openDb, saveAll, saveTurn, StaleGameError } from '../src/storage/db';
import { configOf, nextAction, playGame } from '../../../packages/engine/test/play';

let n = 0;
const fresh = () => openDb(`conflits-${++n}`);
const config = configOf(2);

/** Joue le coup légal d'indice `index` pour le joueur courant. */
function playMove(session: Session, index: number): Session {
    const s = session.state;
    const player = s.players[s.currentPlayerIndex];
    if (!player) throw new Error('joueur courant');
    const move = getLegalMoves(s, player.id)[index];
    if (!move) throw new Error(`coup ${index} absent`);
    const action: GameAction = { type: 'PLACE', actorId: player.id, expectedTurn: s.turnNumber, actionId: `onglet-${index}-${s.turnNumber}`, placements: move.placements };
    const { session: next, result } = submit(session, action);
    if (!result.ok) throw new Error(`coup refusé : ${result.error.detail}`);
    return next;
}

/** Lecture brute de l'enregistrement `games`, sérialisée pour une comparaison octet pour octet. */
async function rawGame(db: IDBDatabase, gameId: string): Promise<string> {
    const tx = db.transaction('games', 'readonly');
    const value = await new Promise<unknown>((resolve, reject) => {
        const r = tx.objectStore('games').get(gameId);
        r.onsuccess = () => { resolve(r.result); };
        r.onerror = () => { reject(r.error ?? new Error('lecture')); };
    });
    if (value === undefined) throw new Error('enregistrement absent');
    return JSON.stringify(value);
}

async function rawEvents(db: IDBDatabase, gameId: string): Promise<unknown[]> {
    const tx = db.transaction('events', 'readonly');
    return new Promise((resolve, reject) => {
        const r = tx.objectStore('events').getAll(IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER]));
        r.onsuccess = () => { resolve(r.result as unknown[]); };
        r.onerror = () => { reject(r.error ?? new Error('lecture')); };
    });
}

describe('write conflicts', () => {
    it('two tabs diverging at the same turn: the second write is refused and the journal stays intact', async () => {
        const db = await fresh();
        const base = playGame(config, 'deux-onglets', { maxTurns: 4 });
        expect(base.state.phase).toBe('playing');
        await saveAll(db, 'g', base, config);

        // Chaque onglet a chargé le même tour N et joue un coup différent.
        const first = playMove(base, 0);
        const second = playMove(base, 1);
        expect(stateHash(first.state)).not.toBe(stateHash(second.state));
        expect(first.state.turnNumber).toBe(second.state.turnNumber);

        await saveTurn(db, 'g', first, config, base.state);
        await expect(saveTurn(db, 'g', second, config, base.state)).rejects.toBeInstanceOf(StaleGameError);

        const loaded = await loadGame(db, 'g');
        expect(loaded.consistent).toBe(true);
        expect(loaded.session).toEqual(first);
        expect(stateHash(loaded.session.state)).toBe(stateHash(first.state));
        expect(loaded.session.events).toHaveLength(base.events.length + 1);
    });

    it('a failing journal write leaves the game record unchanged', async () => {
        const db = await fresh();
        const base = playGame(config, 'journal-en-échec', { maxTurns: 3 });
        await saveAll(db, 'g', base, config);
        const next = (() => {
            const action = nextAction(base);
            const { session, result } = submit(base, action);
            if (!result.ok) throw new Error(`action refusée : ${result.error.detail}`);
            return session;
        })();
        const event = next.events.at(-1);
        if (!event) throw new Error('événement');

        // Un autre écrivain a déjà occupé la clé [gameId, seq] du nouvel événement : `journal.add` échouera.
        const squat = db.transaction('events', 'readwrite');
        squat.objectStore('events').put({ ...event, actionId: 'intrus', gameId: 'g' });
        await new Promise<void>((resolve, reject) => { squat.oncomplete = () => { resolve(); }; squat.onabort = () => { reject(squat.error ?? new Error('intrus')); }; });

        const gameBefore = await rawGame(db, 'g');
        const eventsBefore = await rawEvents(db, 'g');

        await expect(saveTurn(db, 'g', next, config, base.state)).rejects.toMatchObject({ name: 'ConstraintError' });

        // La transaction est annulée en entier : l'instantané écrit avant l'ajout au journal disparaît aussi.
        expect(await rawGame(db, 'g')).toBe(gameBefore);
        expect(await rawEvents(db, 'g')).toEqual(eventsBefore);
        const loaded = await loadGame(db, 'g', 'preview');
        expect(stateHash(loaded.session.state)).toBe(stateHash(base.state));
    });
});

it('a missing game record with an orphan journal is rewritten as one consistent save', async () => {
    const db = await fresh();
    const seed = 'journal-orphelin';
    const orphan = playGame(config, seed, { maxTurns: 3 });
    await saveAll(db, 'g', orphan, config);
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').delete('g');
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => { resolve(); };
        tx.onabort = () => { reject(tx.error ?? new Error('Suppression annulée')); };
    });
    expect(await rawEvents(db, 'g')).toHaveLength(3);

    const initial = playGame(config, seed, { maxTurns: 0 });
    const first = playGame(config, seed, { maxTurns: 1 });
    await saveTurn(db, 'g', first, config, initial.state);

    expect(await rawEvents(db, 'g')).toEqual(first.events.map(event => ({ ...event, gameId: 'g' })));
    expect(await loadGame(db, 'g', 'resume')).toMatchObject({ consistent: true, session: first });
});

it('same state reached by a different event history is refused', async () => {
    const db = await fresh();
    const initial = playGame(config, 'ordre-des-poses', { maxTurns: 0 });
    const player = initial.state.players[initial.state.currentPlayerIndex];
    if (!player) throw new Error('Joueur courant absent');
    const move = getLegalMoves(initial.state, player.id).find(candidate => candidate.placements.length > 1);
    if (!move) throw new Error('Coup à plusieurs galets attendu');
    const action: GameAction = {
        type: 'PLACE', actorId: player.id, expectedTurn: 0, actionId: 'premier-coup', placements: move.placements
    };
    const stored = submit(initial, action);
    const alternate = submit(initial, { ...action, placements: [...action.placements].reverse() });
    if (!stored.result.ok || !alternate.result.ok) throw new Error('Deux coups légaux attendus');
    expect(stateHash(alternate.session.state)).toBe(stateHash(stored.session.state));
    expect(alternate.result.event.hash).not.toBe(stored.result.event.hash);
    await saveAll(db, 'g', stored.session, config);
    const gameBefore = await rawGame(db, 'g');
    const eventsBefore = await rawEvents(db, 'g');

    const next = playMove(alternate.session, 0);
    await expect(saveTurn(db, 'g', next, config, alternate.session.state)).rejects.toBeInstanceOf(StaleGameError);
    expect(await rawGame(db, 'g')).toBe(gameBefore);
    expect(await rawEvents(db, 'g')).toEqual(eventsBefore);
});
