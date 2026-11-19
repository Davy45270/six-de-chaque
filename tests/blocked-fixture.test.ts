// La sauvegarde de référence d'une partie bloquée : rejouable, et elle finit par blocage si chacun passe.
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { applyAction, replay, stateHash } from '@six-de-chaque/engine';
import { parseExport } from '../apps/web/src/storage/transfer';

const FILE = 'tests/fixtures/blocked.json';
it('the blocked reference save replays and ends blocked after a full pass round', () => {
    const parsed = parseExport(readFileSync(FILE, 'utf8'));
    if (!parsed.ok) throw new Error(parsed.reason);
    const save = parsed.save;
    const state = replay(save.config, save.seed, save.events);
    expect(stateHash(state)).toBe(save.checksum);
    expect(stateHash(save.snapshot)).toBe(save.checksum);
    let s = state;
    for (let i = 0; i < s.players.length; i++) {
        const t = applyAction(s, { type: 'PASS', actorId: s.players[s.currentPlayerIndex]?.id ?? '', expectedTurn: s.turnNumber, actionId: `fin-${i}` });
        if (!t.ok) throw new Error(t.error.code);
        s = t.state;
    }
    expect(s).toMatchObject({ phase: 'finished', endReason: 'blocked' });
}, 300_000);
