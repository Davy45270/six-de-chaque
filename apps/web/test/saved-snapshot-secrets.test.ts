import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { loadGame, openDb, saveAll, saveTurn } from '../src/storage/db';
import { exportGame, importGame, parseExport, serializeGame } from '../src/storage/transfer';
import { submit } from '@six-de-chaque/engine';
import { configOf, nextAction, playGame } from '../../../packages/engine/test/play';

// Une sauvegarde ou un export de partie ne transporte aucun secret d'authentification : ni clé qui en porte le
// nom, ni valeur qui ressemble à un jeton (JWT, longue chaîne hexadécimale ou base64). Les empreintes de la
// partie (16 chiffres hexadécimaux, FNV-1a 64) et les identifiants de partie sont attendus et admis.
const SECRET_KEY = /token|secret|passw|auth|api[-_]?key|cookie|session[-_]?id|credential|bearer/i;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;
const LONG_HEX = /^[0-9a-f]{17,}$/i;
const LONG_B64 = /^[A-Za-z0-9+/_-]{32,}={0,2}$/;

function findSecrets(value: unknown, path = '$'): string[] {
    if (typeof value === 'string') return JWT.test(value) || LONG_HEX.test(value) || LONG_B64.test(value) ? [`${path} = jeton`] : [];
    if (Array.isArray(value)) return value.flatMap((v, i) => findSecrets(v, `${path}[${i}]`));
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => [...(SECRET_KEY.test(k) ? [`${path}.${k} : clé`] : []), ...findSecrets(v, `${path}.${k}`)]);
    }
    return [];
}

it('the saved snapshot carries no authentication secret', async () => {
    const config = configOf(2);
    const authToken = 'jeton-factice';
    const rules = { coordinateLimit: 100_000, authToken };
    const injected = {
        ...config, authToken, players: config.players.map(player => ({ ...player, authToken })),
        rules
    };
    const initial = playGame(injected, 'sauvegarde', { maxTurns: 0 });
    const action = nextAction(initial);
    if (action.type !== 'PLACE') throw new Error('pose attendue');
    const injectedAction = { ...action, authToken, placements: action.placements.map(p => ({ ...p, authToken })) };
    const { session, result } = submit(initial, injectedAction);
    expect(result.ok).toBe(true);
    const db = await openDb('secrets');
    const readStore = (store: 'games' | 'events') => new Promise<unknown[]>((resolve, reject) => {
        const read = db.transaction(store).objectStore(store).getAll();
        read.onsuccess = () => { resolve(read.result); };
        read.onerror = () => { reject(read.error ?? new Error('lecture')); };
    });
    try {
        await saveAll(db, 'partie-1', initial, injected);
        const savedAll = await Promise.all([readStore('games'), readStore('events')]);
        await saveTurn(db, 'partie-1', session, injected, initial.state);
        const savedTurn = await Promise.all([readStore('games'), readStore('events')]);
        expect(findSecrets({
            savedAll, savedTurn, serialized: JSON.parse(serializeGame(session, injected)) as unknown
        })).toEqual([]);
        expect(findSecrets(JSON.parse(await exportGame(db, 'partie-1')) as unknown)).toEqual([]);
    } finally {
        db.close();
    }
});

it('an imported save keeps no unknown field in its events', async () => {
    const config = configOf(2);
    const session = playGame(config, 'import', { maxTurns: 3 });
    const parsed = parseExport(serializeGame(session, config));
    if (!parsed.ok) throw new Error(parsed.reason);
    const events = parsed.save.events.map(event => ({ ...event, note: 'extra' }));
    const db = await openDb('import-journal');
    try {
        const gameId = 'partie-importée';
        expect(await importGame(db, JSON.stringify({ ...parsed.save, events }), () => gameId)).toEqual({ ok: true, gameId });
        const stored = await new Promise<unknown[]>((resolve, reject) => {
            const read = db.transaction('events').objectStore('events').getAll();
            read.onsuccess = () => { resolve(read.result); };
            read.onerror = () => { reject(read.error ?? new Error('lecture')); };
        });
        expect.soft(stored).toEqual(session.events.map(event => ({ ...event, gameId })));
        expect(JSON.parse(await exportGame(db, gameId))).toEqual(parsed.save);
    } finally {
        db.close();
    }
});

it('a stored event with an unknown field is never exported', async () => {
    const config = configOf(2);
    const session = playGame(config, 'journal-export', { maxTurns: 1 });
    const event = session.events[0];
    if (!event) throw new Error('Journal vide');
    const extra = { ...event, note: 'champ inconnu' };
    const db = await openDb('export-journal');
    const gameId = 'partie-stockée';
    try {
        await saveAll(db, gameId, session, config);
        const tx = db.transaction('events', 'readwrite');
        tx.objectStore('events').put({ ...extra, gameId });
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => { resolve(); };
            tx.onabort = () => { reject(tx.error ?? new Error('Transaction annulée')); };
        });

        const loaded = await loadGame(db, gameId);
        expect(loaded.consistent).toBe(true);
        expect.soft(loaded.session.events).toEqual(session.events);
        const exported = JSON.parse(await exportGame(db, gameId)) as { events: unknown };
        const serialized = JSON.parse(serializeGame({ ...session, events: [extra] }, config)) as { events: unknown };
        expect.soft(exported.events).toEqual(session.events);
        expect(serialized.events).toEqual(session.events);
    } finally {
        db.close();
    }
});

it('the secret detector rejects a token key, a JWT and a long hexadecimal value', () => {
    expect(findSecrets({ authToken: 'jeton-factice' })).toEqual(['$.authToken : clé']);
    expect(findSecrets({ note: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'c2lnbmF0dXJl'].join('.') })).toHaveLength(1);
    expect(findSecrets({ note: 'a'.repeat(40) })).toHaveLength(1);
    expect(findSecrets({ checksum: '56f2d9312b20a13c', id: 'partie-1' })).toEqual([]);
});
