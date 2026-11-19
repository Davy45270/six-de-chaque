// Import par le chemin réel (parseExport, importGame) d'un export modifié à la main.
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { replay, stateHash } from '@six-de-chaque/engine';
import type { GameState } from '@six-de-chaque/engine';
import { listGames, loadGame, openDb } from '../src/storage/db';
import { importGame, parseExport, serializeGame } from '../src/storage/transfer';
import { configOf, playGame } from '../../../packages/engine/test/play';

let n = 0;
const fresh = () => openDb(`import-modifie-${++n}`);
const config = configOf(2);
const session = playGame(config, 'export-modifie', { maxTurns: 6 });
const exported = serializeGame(session, config);
const replayedScores = replay(config, session.state.seed, session.events).players.map(p => p.score);

type Exported = { snapshot: GameState & Record<string, unknown>; checksum: string };
const edit = (change: (save: Exported) => void, rehash = false): string => {
    const save = JSON.parse(exported) as Exported;
    change(save);
    if (rehash) save.checksum = stateHash(save.snapshot);
    return JSON.stringify(save);
};

/** Importe le fichier ; rend l'état lu en base si l'import est accepté, sinon vérifie le refus et la base vide. */
async function importOrRefuse(json: string): Promise<{ refused: true } | { refused: false; state: GameState }> {
    const db = await fresh();
    const parsed = parseExport(json);
    const result = await importGame(db, json, () => 'importee');
    expect(result.ok).toBe(parsed.ok);
    if (!result.ok) {
        expect(result.reason.trim().length).toBeGreaterThan(5);
        expect(await listGames(db)).toEqual([]);
        return { refused: true };
    }
    const loaded = await loadGame(db, 'importee');
    return { refused: false, state: loaded.session.state };
}

it('the untouched export imports (control for the tampered cases)', async () => {
    expect(session.events.length).toBe(6);
    expect(session.state.players.some(p => p.score > 0)).toBe(true);
    const outcome = await importOrRefuse(exported);
    expect(outcome.refused).toBe(false);
    if (!outcome.refused) expect(stateHash(outcome.state)).toBe(stateHash(session.state));
});

it('an exported file with a negative score is refused with a message, or repaired', async () => {
    for (const rehash of [false, true]) {
        const outcome = await importOrRefuse(edit(save => { save.snapshot.players[0]!.score = -1; }, rehash));
        if (!outcome.refused) expect(outcome.state.players.map(p => p.score)).toEqual(replayedScores);
        // Comportement observé : refus avec un message (le contrat exige un score entier positif ou nul).
        expect(outcome.refused).toBe(true);
    }
});

it('an exported file with an unknown field in the snapshot is refused or stripped', async () => {
    const cases = [
        (save: Exported) => { save.snapshot.note = 'ajout manuel'; },
        (save: Exported) => { (save.snapshot.players[1] as unknown as Record<string, unknown>).note = 'ajout manuel'; }
    ];
    for (const change of cases) {
        for (const rehash of [false, true]) {
            const outcome = await importOrRefuse(edit(change, rehash));
            if (!outcome.refused) {
                expect(outcome.state).not.toHaveProperty('note');
                for (const player of outcome.state.players) expect(player).not.toHaveProperty('note');
            }
            // Comportement observé : refus avec un message (instantané sans propriété supplémentaire).
            expect(outcome.refused).toBe(true);
        }
    }
});

it('an exported file whose snapshot was edited but whose journal is intact never imports the edited snapshot', async () => {
    const original = session.state.players[0]!.score;
    const edited = original + 12;
    for (const rehash of [false, true]) {
        const outcome = await importOrRefuse(edit(save => { save.snapshot.players[0]!.score = edited; }, rehash));
        if (!outcome.refused) {
            expect(outcome.state.players[0]!.score).not.toBe(edited);
            expect(outcome.state.players.map(p => p.score)).toEqual(replayedScores);
        }
        // Comportement observé : refus, le journal intact ne redonne pas l'instantané modifié.
        expect(outcome.refused).toBe(true);
    }
});
