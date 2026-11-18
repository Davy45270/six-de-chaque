import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { stateHash } from '@six-de-chaque/engine';
import type { Session } from '@six-de-chaque/engine';
import { listGames, loadGame, openDb, saveAll, saveTurn, getSetting, setSetting, deleteGame } from '../src/storage/db';
import { migrate } from '../src/storage/migrations';
import { exportGame, importGame } from '../src/storage/transfer';
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
            s = { state: i === 5 ? full.state : playGame(config, 'sauvegarde', { maxTurns: i }).state, events: full.events.slice(0, i) };
            await saveTurn(db, 'g1', s, config);
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
    it('migrate rejects version 2', () => {
        expect(() => migrate({ ...game(0).state, version: 2 })).toThrow(/version/);
        expect(() => migrate(null)).toThrow();
        expect(migrate(JSON.parse(JSON.stringify(game(1).state)))).toEqual(game(1).state);
    });
    it('settings persist', async () => {
        const db = await fresh();
        expect(await getSetting(db, 'highContrast')).toBeUndefined();
        await setSetting(db, 'highContrast', true);
        expect(await getSetting<boolean>(db, 'highContrast')).toBe(true);
    });
});
