// Produit des sauvegardes v1 avec le code de la version publiée (arbre de travail passé dans V1_ROOT).
// Les modules v1 sont chargés à l'exécution. Ce script ne copie aucune règle de la version courante.
// Usage : voir tests/fixtures/v1-online/README.md.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

type Kind = 'PLACE' | 'EXCHANGE' | 'PASS';
interface V1Player { id: string; name: string; type: 'human' | 'ai'; aiLevel?: 'beginner' | 'intermediate'; hand: string[] }
interface V1State { seed: string; turnNumber: number; currentPlayerIndex: number; phase: string; bag: string[]; players: V1Player[] }
interface V1Action { type: Kind; actorId: string; expectedTurn: number; actionId: string; tileIds?: string[]; placements?: Array<{ tileId: string; x: number; y: number }> }
interface V1Session { state: V1State; events: Array<{ action: V1Action }> }
interface V1Config { players: Array<Pick<V1Player, 'id' | 'name' | 'type' | 'aiLevel'>> }
interface V1Engine {
    createGame(config: V1Config, seed: string): V1State;
    submit(session: V1Session, action: V1Action): { session: V1Session; result: { ok: boolean; error?: { code: string } } };
    projectPublicState(state: V1State, viewer: string): unknown;
    validateAction(state: V1State, action: V1Action): { ok: boolean };
    getLegalMoves(state: V1State, playerId: string): Array<{ placements: Array<{ tileId: string; x: number; y: number }> }>;
}
interface V1Ai { decideNow(view: unknown, hand: string[], playerId: string, level: string, budget: number, turn: number, passLegal: boolean): { action: V1Action } }
interface V1Db {
    openDb(name: string): Promise<IDBDatabase>;
    saveAll(db: IDBDatabase, id: string, session: V1Session, config: V1Config): Promise<void>;
    saveTurn(db: IDBDatabase, id: string, session: V1Session, config: V1Config): Promise<void>;
    setSetting(db: IDBDatabase, key: string, value: unknown): Promise<void>;
}
interface V1Transfer { exportGame(db: IDBDatabase, id: string): Promise<string> }
interface V1Controller { passLegal(session: V1Session): boolean }

interface Scenario {
    name: string; gameId: string; seed: string;
    /** Graines suivantes essayées dans l'ordre si la partie ne finit pas dans l'état voulu. */
    retries?: number; config: V1Config; highContrast: boolean | null;
    /** Échange volontaire d'un humain à ces tours (hors ouverture). */
    exchangeAt?: number[];
    /** Réserve vide : les humains posent une seule tuile (fin de partie lente, qui peut bloquer). */
    slowEnd?: boolean;
    stop(session: V1Session): boolean;
}

const OUT = resolve('tests/fixtures/v1-online');
const kinds = (s: V1Session): Kind[] => s.events.map(e => e.action.type);

const SCENARIOS: Scenario[] = [
    {
        name: 'two-players-in-progress', gameId: 'partie-0a1b2c3d-0000-4000-8000-000000000001', seed: '5f0c9e2a-6b1d-4c3e-9a7f-2d8b4e6f1a01',
        config: { players: [{ id: 'j1', name: 'Camille', type: 'human' }, { id: 'j2', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner' }] },
        highContrast: true, stop: s => s.events.length >= 10
    },
    {
        name: 'four-players-exchanges-passes', gameId: 'partie-0a1b2c3d-0000-4000-8000-000000000002', seed: '5f0c9e2a-6b1d-4c3e-9a7f-2d8b4e6f0038',
        config: { players: [
            { id: 'j1', name: 'Sacha', type: 'human' }, { id: 'j2', name: 'Ordinateur 1', type: 'ai', aiLevel: 'beginner' },
            { id: 'j3', name: 'Alix', type: 'human' }, { id: 'j4', name: 'Ordinateur 2', type: 'ai', aiLevel: 'intermediate' }
        ] },
        highContrast: false, exchangeAt: [2, 3, 5, 6, 9, 10], slowEnd: true, retries: 200,
        stop: s => kinds(s).includes('PASS') && kinds(s).filter(k => k === 'EXCHANGE').length >= 2
    },
    {
        name: 'finished', gameId: 'partie-0a1b2c3d-0000-4000-8000-000000000003', seed: '5f0c9e2a-6b1d-4c3e-9a7f-2d8b4e6f1a03',
        config: { players: [{ id: 'j1', name: 'Dominique', type: 'human' }, { id: 'j2', name: 'Ordinateur', type: 'ai', aiLevel: 'intermediate' }] },
        highContrast: null, stop: () => false
    },
    {
        name: 'accented-names', gameId: 'partie-0a1b2c3d-0000-4000-8000-000000000004', seed: '5f0c9e2a-6b1d-4c3e-9a7f-2d8b4e6f1a04',
        config: { players: [
            { id: 'j1', name: 'Éloïse', type: 'human' }, { id: 'j2', name: 'Jérôme Œillet', type: 'human' },
            { id: 'j3', name: 'Noël à l’Été', type: 'ai', aiLevel: 'beginner' }
        ] },
        highContrast: true, stop: s => s.events.length >= 8
    }
];

async function load<T>(root: string, path: string): Promise<T> {
    return await import(/* @vite-ignore */ join(root, path)) as T;
}

function dumpStore(db: IDBDatabase, store: string): Promise<unknown[]> {
    return new Promise((ok, ko) => {
        const os = db.transaction(store, 'readonly').objectStore(store);
        const keys = os.getAllKeys();
        const values = os.getAll();
        values.onsuccess = () => {
            const rows = values.result as unknown[];
            ok(store === 'settings' ? rows.map((value, i) => ({ key: keys.result[i], value })) : rows);
        };
        values.onerror = () => { ko(values.error ?? new Error(store)); };
    });
}

export async function main(): Promise<void> {
    const root = process.env.V1_ROOT;
    if (!root) throw new Error('V1_ROOT : chemin de l’arbre de la version publiée');
    const engine = await load<V1Engine>(root, 'packages/engine/src/index.ts');
    const ai = await load<V1Ai>(root, 'packages/ai/src/policies.ts');
    const store = await load<V1Db>(root, 'apps/web/src/storage/db.ts');
    const transfer = await load<V1Transfer>(root, 'apps/web/src/storage/transfer.ts');
    const controller = await load<V1Controller>(root, 'apps/web/src/game/controller.ts');
    mkdirSync(OUT, { recursive: true });
    const sums: string[] = [];
    const write = (file: string, text: string): void => {
        writeFileSync(join(OUT, file), text);
        sums.push(`${createHash('sha256').update(text).digest('hex')}  ${file}`);
    };

    type Played = { db: IDBDatabase; session: V1Session; seed: string };
    const play = async (sc: Scenario, seed: string): Promise<Played | null> => {
        // Une base neuve par essai, sous le nom réel de l'application v1.
        globalThis.indexedDB = new IDBFactory();
        // Parcours de l'application v1 : nouvelle partie (saveAll + lastGameId), un saveTurn par coup validé.
        const db = await store.openDb('six-de-chaque');
        let session: V1Session = { state: engine.createGame(sc.config, seed), events: [] };
        await store.saveAll(db, sc.gameId, session, sc.config);
        await store.setSetting(db, 'lastGameId', sc.gameId);
        if (sc.highContrast !== null) await store.setSetting(db, 'highContrast', sc.highContrast);
        while (session.state.phase !== 'finished' && !sc.stop(session)) {
            const s = session.state;
            const me = s.players[s.currentPlayerIndex];
            if (!me) throw new Error('joueur courant');
            const pass = controller.passLegal(session);
            let action: V1Action;
            if (me.type === 'ai') {
                action = ai.decideNow(engine.projectPublicState(s, me.id), [...me.hand], me.id, me.aiLevel ?? 'beginner', 20_000, s.turnNumber, pass).action;
            } else {
                const ids = { PLACE: 'pose', EXCHANGE: 'echange', PASS: 'passe' } as const;
                const swap: V1Action = { type: 'EXCHANGE', actorId: me.id, expectedTurn: s.turnNumber, actionId: '', tileIds: me.hand.slice(0, 2) };
                const single = sc.slowEnd && s.bag.length === 0 ? engine.getLegalMoves(s, me.id).find(m => m.placements.length === 1) : undefined;
                const wanted: V1Action = sc.exchangeAt?.includes(s.turnNumber) && engine.validateAction(s, swap).ok
                    ? swap
                    : single ? { type: 'PLACE', actorId: me.id, expectedTurn: s.turnNumber, actionId: '', placements: single.placements }
                    : ai.decideNow(engine.projectPublicState(s, me.id), [...me.hand], me.id, 'intermediate', 5000, s.turnNumber, pass).action;
                action = { ...wanted, actionId: `${sc.gameId}-${s.turnNumber}-${ids[wanted.type]}` };
            }
            const next = engine.submit(session, action);
            if (!next.result.ok) throw new Error(`${sc.name} : coup refusé ${next.result.error?.code ?? ''}`);
            session = next.session;
            await store.saveTurn(db, sc.gameId, session, sc.config);
        }
        const wantFinished = sc.name === 'finished';
        if ((session.state.phase === 'finished') !== wantFinished) { db.close(); return null; }
        return { db, session, seed };
    };

    for (const sc of SCENARIOS) {
        let played: Played | null = null;
        for (let i = 0; !played && i <= (sc.retries ?? 0); i++) {
            played = await play(sc, i === 0 ? sc.seed : `${sc.seed.slice(0, -4)}${i.toString(16).padStart(4, '0')}`);
        }
        if (!played) throw new Error(`${sc.name} : aucune graine ne donne l’état voulu`);
        const { db, session } = played;
        write(`${sc.name}.export.json`, await transfer.exportGame(db, sc.gameId));
        const dump = { dbName: db.name, dbVersion: db.version, stores: {
            games: await dumpStore(db, 'games'), events: await dumpStore(db, 'events'), settings: await dumpStore(db, 'settings')
        } };
        if (!isDeepStrictEqual(JSON.parse(JSON.stringify(dump)), dump)) throw new Error(`${sc.name} : enregistrement non représentable en JSON`);
        write(`${sc.name}.indexeddb.json`, `${JSON.stringify(dump, null, 1)}\n`);
        db.close();
        console.log(`${sc.name} (graine ${played.seed}) : ${session.events.length} coups, ${kinds(session).filter(k => k !== 'PLACE').join(' ') || 'poses seules'}, ${session.state.phase}`);
    }
    console.log(sums.join('\n'));
}
