import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDb, saveAll, saveTurn } from '../src/storage/db';
import { exportGame, serializeGame } from '../src/storage/transfer';
import { configOf, playGame } from '../../../packages/engine/test/play';

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
    const session = playGame(config, 'sauvegarde', { maxTurns: 6 });
    const db = await openDb('secrets');
    const readGames = () => new Promise<unknown[]>((resolve, reject) => {
        const read = db.transaction('games').objectStore('games').getAll();
        read.onsuccess = () => { resolve(read.result); };
        read.onerror = () => { reject(read.error ?? new Error('lecture')); };
    });
    try {
        await saveAll(db, 'partie-1', session, injected);
        const savedAll = await readGames();
        await saveTurn(db, 'partie-1', session, injected);
        const savedTurn = await readGames();
        expect(findSecrets({
            savedAll, savedTurn, serialized: JSON.parse(serializeGame(session, injected)) as unknown
        })).toEqual([]);
        expect(findSecrets(JSON.parse(await exportGame(db, 'partie-1')) as unknown)).toEqual([]);
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
