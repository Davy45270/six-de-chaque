import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { gameV2Schema, validateGameAction, validateGameSnapshot } from '@six-de-chaque/contracts';
import { stateHash, submit } from '@six-de-chaque/engine';
import type { GameConfig, Session } from '@six-de-chaque/engine';
import { openDb, saveAll } from '../src/storage/db';
import { exportGame, importGame, parseExport, SAVE_FORMAT, serializeGame } from '../src/storage/transfer';
import { configOf, nextAction, playGame } from '../../../packages/engine/test/play';

// Un fichier exporté ne transporte que ce que le schéma de sauvegarde v2 connaît : l'instantané est validé par
// le contrat publié, et chaque clé de l'instantané et de ses joueurs est une propriété déclarée du schéma.
const SNAPSHOT_KEYS = new Set(Object.keys(gameV2Schema.properties));
const PLAYER_KEYS = new Set(Object.keys(gameV2Schema.properties.players.items.properties));
const CONFIG_KEYS = new Set(Object.keys(gameV2Schema.properties.config.properties));
const ENVELOPE_KEYS = ['checksum', 'config', 'events', 'format', 'seed', 'snapshot', 'version'];
const EVENT_KEYS = ['action', 'actionId', 'finalBonus', 'hash', 'prevHash', 'score', 'seq', 'stateHash'];

const withLevels: GameConfig = {
    players: [
        { id: 'h0', name: 'h0', type: 'human' },
        { id: 'b1', name: 'b1', type: 'ai', aiLevel: 'expert' },
        { id: 'b2', name: 'b2', type: 'ai', aiLevel: 'advanced' }
    ]
};

/** Une partie avec un échange après l'ouverture, puis quelques tours. */
function withExchange(): { session: Session; config: GameConfig } {
    const config = configOf(2);
    let session = playGame(config, 'echange', { maxTurns: 2 });
    const player = session.state.players[session.state.currentPlayerIndex];
    if (!player) throw new Error('joueur courant');
    const exchange = submit(session, {
        actorId: player.id, expectedTurn: session.state.turnNumber, actionId: 'echange-2', type: 'EXCHANGE', tileIds: player.hand.slice(0, 3)
    });
    if (!exchange.result.ok) throw new Error(`échange refusé : ${exchange.result.error.code}`);
    session = exchange.session;
    for (let i = 0; i < 4; i++) {
        const next = submit(session, nextAction(session));
        if (!next.result.ok) throw new Error('tour refusé');
        session = next.session;
    }
    return { session, config };
}

function games(): Array<{ name: string; session: Session; config: GameConfig }> {
    const finished = playGame(configOf(3), 'terminee');
    const config4 = configOf(4);
    return [
        { name: 'en cours', session: playGame(configOf(2), 'en-cours', { maxTurns: 6 }), config: configOf(2) },
        { name: 'terminée', session: finished, config: configOf(3) },
        { name: 'quatre joueurs, niveaux v2', session: playGame(withLevels, 'niveaux', { maxTurns: 9 }), config: withLevels },
        { name: 'quatre joueurs', session: playGame(config4, 'quatre', { maxTurns: 12, pick: n => n - 1, limit: 4 }), config: config4 },
        { name: 'avec échange', ...withExchange() }
    ];
}

it('every exported file validates against the save schema and carries only known snapshot fields', async () => {
    const all = games();
    expect(all.find(g => g.name === 'terminée')?.session.state.phase).toBe('finished');
    expect(all.find(g => g.name === 'en cours')?.session.state.phase).not.toBe('finished');
    expect(all.find(g => g.name === 'avec échange')?.session.events.some(e => e.action.type === 'EXCHANGE')).toBe(true);
    const db = await openDb('export-schema');
    try {
        for (const [i, { name, session, config }] of all.entries()) {
            const gameId = `partie-${i}`;
            await saveAll(db, gameId, session, config);
            for (const json of [serializeGame(session, config), await exportGame(db, gameId)]) {
                const file = JSON.parse(json) as Record<string, unknown>;
                expect(Object.keys(file).sort(), name).toEqual(ENVELOPE_KEYS);
                expect(file.format, name).toBe(SAVE_FORMAT);
                expect(file.version, name).toBe(2);
                const checked = validateGameSnapshot(file.snapshot);
                expect(checked, name).toEqual({ ok: true, value: file.snapshot });
                const snapshot = file.snapshot as Record<string, unknown> & { players: Array<Record<string, unknown>>; config: Record<string, unknown> };
                for (const key of Object.keys(snapshot)) expect(SNAPSHOT_KEYS.has(key), `${name} : snapshot.${key}`).toBe(true);
                for (const player of snapshot.players) {
                    for (const key of Object.keys(player)) expect(PLAYER_KEYS.has(key), `${name} : joueur.${key}`).toBe(true);
                }
                for (const key of Object.keys(snapshot.config)) expect(CONFIG_KEYS.has(key), `${name} : config.${key}`).toBe(true);
                expect(file.seed, name).toBe(snapshot.seed);
                expect(file.checksum, name).toBe(stateHash(session.state));
                const events = file.events as Array<Record<string, unknown>>;
                expect(events, name).toHaveLength(session.events.length);
                for (const event of events) {
                    expect(Object.keys(event).sort(), name).toEqual(EVENT_KEYS);
                    expect(validateGameAction(event.action).ok, `${name} : action ${String(event.seq)}`).toBe(true);
                }
            }
        }
    } finally {
        db.close();
    }
});

it('an export re-imports to the same snapshot and journal', async () => {
    const db = await openDb('export-aller-retour');
    try {
        for (const [i, { name, session, config }] of games().entries()) {
            const json = serializeGame(session, config);
            const parsed = parseExport(json);
            if (!parsed.ok) throw new Error(`${name} : ${parsed.reason}`);
            const { snapshot, events } = parsed.save;
            // Champ par champ, pour que l'écart nomme le champ perdu ou altéré.
            expect(Object.keys(snapshot).sort(), name).toEqual(Object.keys(session.state).sort());
            for (const key of Object.keys(session.state) as Array<keyof typeof session.state>) {
                expect(snapshot[key], `${name} : snapshot.${key}`).toEqual(session.state[key]);
            }
            expect(stateHash(snapshot), name).toBe(stateHash(session.state));
            expect(events, name).toHaveLength(session.events.length);
            for (const [seq, event] of session.events.entries()) {
                for (const key of Object.keys(event) as Array<keyof typeof event>) {
                    expect(events[seq]?.[key], `${name} : événement ${seq}.${key}`).toEqual(event[key]);
                }
            }
            expect(parsed.save.config, name).toEqual((JSON.parse(json) as { config: unknown }).config);

            const gameId = `importée-${i}`;
            expect(await importGame(db, json, () => gameId), name).toEqual({ ok: true, gameId });
            const again = await exportGame(db, gameId);
            expect(JSON.parse(again), name).toEqual(JSON.parse(json));
        }
    } finally {
        db.close();
    }
});
