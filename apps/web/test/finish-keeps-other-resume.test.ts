import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import type { Session } from '@six-de-chaque/engine';
import { getSetting, openDb, saveAll, saveTurn } from '../src/storage/db';
import { configOf, playGame } from '../../../packages/engine/test/play';

const config = configOf(2);

it('finishing game B keeps the resume pointer on game A', async () => {
    const db = await openDb('fin-autre-partie');
    await saveAll(db, 'partie-A', playGame(config, 'reprise-A', { maxTurns: 3 }), config, { resumeOnReload: true });
    expect(await getSetting(db, 'lastGameId')).toBe('partie-A');

    const full: Session = playGame(config, 'fin-B');
    expect(full.state.phase).toBe('finished');
    const before = playGame(config, 'fin-B', { maxTurns: full.events.length - 1 });
    expect(before.state.phase).not.toBe('finished');
    await saveAll(db, 'partie-B', before, config);
    await saveTurn(db, 'partie-B', full, config, before.state);

    expect(await getSetting(db, 'lastFinishedGameId')).toBe('partie-B');
    expect(await getSetting(db, 'lastGameId')).toBe('partie-A');
});
