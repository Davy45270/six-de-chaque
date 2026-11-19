import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import blocked from '../../../tests/fixtures/blocked.json';
import { canonicalJson, eventHash, fnv1a64, GENESIS_HASH, replay, stateHash } from '@six-de-chaque/engine';
import type { Session } from '@six-de-chaque/engine';
import { listGames, loadGame, openDb, saveAll, saveTurn, getSetting, setSetting, deleteGame, completeChallenge } from '../src/storage/db';
import { migrate, migrateSave, SaveError } from '../src/storage/migrations';
import { exportGame, importGame, parseExport } from '../src/storage/transfer';
import { configOf, playGame } from '../../../packages/engine/test/play';

let n = 0;
const fresh = () => openDb(`test-${++n}`);
const config = configOf(2);
const game = (turns: number): Session => playGame(config, 'sauvegarde', { maxTurns: turns });

describe('storage', () => {
    it('save then load returns the same session', async () => {
        const db = await fresh();
        let s: Session = { state: game(0).state, events: [] };
        await saveAll(db, 'g1', s, config);
        const full = game(5);
        for (let i = 1; i <= 5; i++) {
            const previous = s.state;
            s = { state: i === 5 ? full.state : playGame(config, 'sauvegarde', { maxTurns: i }).state, events: full.events.slice(0, i) };
            await saveTurn(db, 'g1', s, config, previous);
        }
        const loaded = await loadGame(db, 'g1');
        expect(loaded.session).toEqual(full);
        expect(loaded.consistent).toBe(true);
        expect(loaded.config).toEqual(config);
        expect(await listGames(db)).toEqual([{ id: 'g1', updatedTurn: 5, finished: false }]);
        await deleteGame(db, 'g1');
        expect(await listGames(db)).toEqual([]);
    });
    it('loadGame flags an inconsistent snapshot without deleting it', async () => {
        const db = await fresh();
        const s = game(4);
        const p0 = s.state.players[0];
        if (!p0) throw new Error('joueur');
        const tampered = { ...s, state: { ...s.state, players: [{ ...p0, score: p0.score + 50 }, ...s.state.players.slice(1)] } };
        await saveAll(db, 'g', tampered, config);
        const loaded = await loadGame(db, 'g');
        expect(loaded.consistent).toBe(false);
        expect((await listGames(db)).map(g => g.id)).toEqual(['g']);
    });
    it('T21 corrupted JSON import returns an error and keeps the existing save', async () => {
        const db = await fresh();
        await saveAll(db, 'garde', game(3), config);
        const before = await loadGame(db, 'garde');
        for (const bad of ['{pas du json', '{"format":"autre"}', JSON.stringify({ format: 'six-de-chaque-save', version: 7 })]) {
            const r = await importGame(db, bad);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason.length).toBeGreaterThan(5);
        }
        expect(await loadGame(db, 'garde')).toEqual(before);
        expect(await listGames(db)).toHaveLength(1);
    });
    it('T21 import of an inconsistent snapshot keeps the existing save', async () => {
        const db = await fresh();
        await saveAll(db, 'garde', game(3), config);
        const good = JSON.parse(await exportGame(db, 'garde')) as { snapshot: { bag: string[]; players: Array<{ hand: string[] }> }; events: Array<{ hash: string }> };
        const duplicate = structuredClone(good); duplicate.snapshot.bag[0] = duplicate.snapshot.players[0]?.hand[0] ?? '';
        const missing = structuredClone(good); missing.snapshot.bag.pop();
        const broken = structuredClone(good); if (broken.events[1]) broken.events[1].hash = '0123456789abcdef';
        for (const bad of [duplicate, missing, broken]) {
            const r = await importGame(db, JSON.stringify(bad));
            expect(r.ok).toBe(false);
        }
        expect(await listGames(db)).toEqual([{ id: 'garde', updatedTurn: 3, finished: false }]);
    });
    it('export then import round-trips', async () => {
        const db = await fresh();
        const s = game(6);
        await saveAll(db, 'origine', s, config);
        const r = await importGame(db, await exportGame(db, 'origine'), () => 'copie');
        expect(r).toEqual({ ok: true, gameId: 'copie' });
        const copy = await loadGame(db, 'copie');
        expect(stateHash(copy.session.state)).toBe(stateHash(s.state));
        expect(copy.session.events).toEqual(s.events);
        expect(copy.consistent).toBe(true);
    });
    it('migrates a strict v1 snapshot to v2', () => {
        const initial = game(0).state;
        const strict = (state: typeof initial) => {
            const { consecutivePasses: _p, config: _c, endReason: _e, ...base } = state;
            return { ...base, version: 1, players: base.players.map(({ aiLevel: _a, ...p }) => p) };
        };
        const snapshot = strict(initial);
        expect(migrate(snapshot)).toEqual(initial);
        expect(migrate({ ...snapshot, phase: 'finished' })).toMatchObject({ endReason: 'blocked', consecutivePasses: 2 });
        expect(migrate({ ...snapshot, phase: 'finished', players: snapshot.players.map((p, i) => i === 0 ? { ...p, hand: [] } : p) }))
            .toMatchObject({ endReason: 'out', consecutivePasses: 0 });
        const progressed = game(3);
        let previous = GENESIS_HASH;
        const events = progressed.events.map((event, i) => {
            const legacy = { ...event, prevHash: previous, stateHash: fnv1a64(canonicalJson(strict(game(i + 1).state))) };
            legacy.hash = eventHash(previous, legacy);
            previous = legacy.hash;
            return legacy;
        });
        const oldSnapshot = strict(progressed.state);
        const migrated = migrateSave({ version: 1, config: { players: config.players.map(({ aiLevel: _a, ...p }) => p) },
            snapshot: oldSnapshot, events, checksum: fnv1a64(canonicalJson(oldSnapshot)) });
        expect({ state: migrated.snapshot, events: migrated.events }).toEqual(progressed);
    });
    it('migrates a published extended v1 save and its log to v2', async () => {
        const db = await fresh();
        const parsed = parseExport(JSON.stringify(blocked));
        if (!parsed.ok) throw new Error(parsed.reason);
        const save = parsed.save;
        expect(save.version).toBe(2);
        expect(save.snapshot).toEqual({ ...blocked.snapshot, version: 2 });
        expect(save.events.map(e => e.action)).toEqual(blocked.events.map(e => e.action));
        expect(save.events.at(-1)?.hash).not.toBe(blocked.events.at(-1)?.hash);
        expect(replay(save.config, save.seed, save.events)).toEqual(save.snapshot);
        expect(await importGame(db, JSON.stringify(blocked), () => 'bloc')).toEqual({ ok: true, gameId: 'bloc' });
        expect(JSON.parse(await exportGame(db, 'bloc'))).toEqual(save);
        const tx = db.transaction(['games', 'events'], 'readwrite');
        tx.objectStore('games').put({ ...blocked, id: 'ancien', updatedTurn: blocked.snapshot.turnNumber });
        for (const event of blocked.events) tx.objectStore('events').put({ ...event, gameId: 'ancien' });
        expect((await loadGame(db, 'ancien')).session).toEqual({ state: save.snapshot, events: save.events });
        const updated = db.transaction('games').objectStore('games').get('ancien') as IDBRequest<{ version: number }>;
        await expect(new Promise(resolve => { updated.onsuccess = () => resolve(updated.result.version); })).resolves.toBe(2);
    });
    it('migration refuses a v1 log that does not replay to its snapshot', async () => {
        const db = await fresh();
        const snapshot = structuredClone(blocked.snapshot);
        snapshot.players[0]!.score += 1;
        const save = { ...blocked, snapshot, checksum: fnv1a64(canonicalJson(snapshot)) };
        expect(() => migrateSave(save)).toThrow(SaveError);
        expect((await importGame(db, JSON.stringify(save))).ok).toBe(false);
        const events = structuredClone(blocked.events);
        events[0]!.hash = '0'.repeat(16);
        expect(() => migrateSave({ ...blocked, events })).toThrow(SaveError);
        expect(await listGames(db)).toEqual([]);
        const tx = db.transaction(['games', 'events'], 'readwrite');
        tx.objectStore('games').put({ ...save, id: 'refus', updatedTurn: snapshot.turnNumber });
        for (const event of save.events) tx.objectStore('events').put({ ...event, gameId: 'refus' });
        await expect(loadGame(db, 'refus')).rejects.toBeInstanceOf(SaveError);
        const unchanged = db.transaction('games').objectStore('games').get('refus') as IDBRequest<{ version: number }>;
        await expect(new Promise(resolve => { unchanged.onsuccess = () => resolve(unchanged.result.version); })).resolves.toBe(1);
    });
    it('unknown save version is refused', () => {
        expect(() => migrate({ ...game(0).state, version: 9 })).toThrow(SaveError);
        expect(() => migrateSave({ ...blocked, version: 9 })).toThrow(SaveError);
        expect(parseExport(JSON.stringify({ ...blocked, version: 9 })).ok).toBe(false);
    });
    it('keeps distinct challenge completions across concurrent updates', async () => {
        const db = await fresh();
        await Promise.all([completeChallenge(db, 'rivage'), completeChallenge(db, 'dune'), completeChallenge(db, 'rivage')]);
        expect(await getSetting(db, 'completedChallenges')).toEqual(['rivage', 'dune']);
        db.close();
    });
    it('settings persist', async () => {
        const db = await fresh();
        expect(await getSetting(db, 'highContrast')).toBeUndefined();
        await setSetting(db, 'highContrast', true);
        expect(await getSetting<boolean>(db, 'highContrast')).toBe(true);
    });
});

it('T21 an event that is null or malformed gives a controlled error and keeps the existing save', async () => {
    const db = await fresh();
    await saveAll(db, 'garde', game(3), config);
    const before = await loadGame(db, 'garde');
    const exported = JSON.parse(await exportGame(db, 'garde')) as { events: unknown[] };
    for (const event of [null, [], {}, 42, { action: null }, { ...(exported.events[0] as object), finalBonus: '0' }]) {
        const bad = { ...exported, events: [event, ...exported.events.slice(1)] };
        const result = await importGame(db, JSON.stringify(bad), () => 'garde');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).not.toEqual('');
    }
    expect(await loadGame(db, 'garde')).toEqual(before);
    expect(await listGames(db)).toHaveLength(1);
});

it('export refuses a game whose log does not replay to its snapshot', async () => {
    const db = await fresh();
    const session = game(3);
    await saveAll(db, 'incohérente', { ...session, events: session.events.slice(0, -1) }, config);
    await expect(exportGame(db, 'incohérente')).rejects.toBeInstanceOf(SaveError);
});
