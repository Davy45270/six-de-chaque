import { describe, expect, it } from 'vitest';
import { createGame, stateHash } from '@six-de-chaque/engine';
import { createAiHost } from '../src/host';
import { AiClient } from '../src/client';
import type { FromWorker, ToWorker } from '../src/protocol';
import { configOf } from '../../engine/test/play';
import { positionOf } from './positions';

function manual() {
    const queue: Array<() => void> = [];
    const posted: FromWorker[] = [];
    const host = createAiHost(m => posted.push(m), fn => queue.push(fn), 4);
    const runAll = (): number => { let n = 0; while (queue.length) { (queue.shift() as () => void)(); n++; } return n; };
    return { queue, posted, host, runAll };
}
const pos = positionOf(createGame(configOf(2), 'hote'));
const request = (requestId: string, gameHash = 'h1'): ToWorker => ({ type: 'REQUEST_MOVES', requestId, gameHash, view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'intermediate', budgetNodes: 10_000 });

describe('ai host', () => {
    it('T24 CANCEL stops the search before RESULT', () => {
        const m = manual();
        m.host(request('r1'));
        expect(m.queue.length).toBe(1);
        (m.queue.shift() as () => void)();
        expect(m.posted).toEqual([]);
        m.host({ type: 'CANCEL', requestId: 'r1' });
        m.runAll();
        expect(m.posted).toEqual([]);
        const full = manual();
        full.host(request('r2'));
        expect(full.runAll()).toBeGreaterThan(1);
        expect(full.posted.map(p => p.type)).toEqual(['RESULT']);
    });
    it('T24 stale result after state change is ignored', async () => {
        const listeners: Array<(e: { data: FromWorker }) => void> = [];
        const m = manual();
        const worker = { postMessage: (x: ToWorker) => { m.host(x); }, addEventListener: (_: 'message', fn: (e: { data: FromWorker }) => void) => { listeners.push(fn); } };
        const client = new AiClient(worker);
        let current = 'h1';
        const answer = client.request({ type: 'REQUEST_MOVES', gameHash: 'h1', view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'beginner', budgetNodes: 10_000 }, () => current);
        current = 'h2';   // l'humain a annulé, la partie a été rechargée…
        m.runAll();
        for (const p of m.posted) for (const l of listeners) l({ data: p });
        expect(m.posted.map(p => p.type)).toEqual(['RESULT']);
        await expect(answer).resolves.toBeNull();
        // Sans changement, la même demande rend la décision.
        const again = client.request({ type: 'REQUEST_MOVES', gameHash: 'h2', view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'beginner', budgetNodes: 10_000 }, () => current);
        m.runAll();
        for (const p of m.posted.slice(1)) for (const l of listeners) l({ data: p });
        await expect(again).resolves.toMatchObject({ move: { type: 'PLACE' } });
        // Annuler côté client rend null tout de suite.
        const cancelled = client.request({ type: 'REQUEST_MOVES', gameHash: 'h3', view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'beginner', budgetNodes: 10_000 }, () => 'h3');
        client.cancel();
        await expect(cancelled).resolves.toBeNull();
        expect(stateHash(pos.state)).toMatch(/^[0-9a-f]{16}$/);
    });
    it('ERROR is posted when the view is malformed', () => {
        const m = manual();
        m.host({ ...request('bad'), view: null } as unknown as ToWorker);
        m.host({ ...request('bad2'), hand: ['t-999'] } as ToWorker);
        m.runAll();
        expect(m.posted.map(p => [p.type, p.requestId])).toEqual([['ERROR', 'bad'], ['ERROR', 'bad2']]);
    });
    it('cache returns the same decision without new nodes', () => {
        const m = manual();
        m.host(request('c1'));
        m.runAll();
        m.host(request('c2'));
        expect(m.queue).toHaveLength(0);
        expect(m.posted).toHaveLength(2);
        const [a, b] = m.posted;
        if (a?.type !== 'RESULT' || b?.type !== 'RESULT') throw new Error('résultats');
        expect(b.decision).toEqual(a.decision);
        expect(b.requestId).toBe('c2');
    });
});

it('REQUEST_HINT is answered like REQUEST_MOVES with its own cache key', () => {
    const m = manual();
    m.host(request('move'));
    expect(m.runAll()).toBeGreaterThan(0);
    m.host({ ...request('hint'), type: 'REQUEST_HINT' } as ToWorker);
    expect(m.runAll()).toBeGreaterThan(0);
    m.host({ ...request('cached-hint'), type: 'REQUEST_HINT' } as ToWorker);
    expect(m.runAll()).toBe(0);
    const [move, hint, cached] = m.posted;
    expect(move).toMatchObject({ type: 'RESULT', requestId: 'move', decision: { move: { type: 'PLACE' } } });
    expect(hint).toEqual({ ...move, requestId: 'hint' });
    expect(cached).toEqual({ ...hint, requestId: 'cached-hint' });
});
