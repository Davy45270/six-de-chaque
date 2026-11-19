import { describe, expect, it, vi } from 'vitest';
import { createGame, stateHash } from '@six-de-chaque/engine';
import { createAiHost } from '../src/host';
import { AiClient } from '../src/client';
import type { AiRequest, FromWorker, ToWorker } from '../src/protocol';
import { configOf } from '../../engine/test/play';
import { positionOf } from './positions';
import { stateFrom } from '../../engine/test/fixtures';

function manual() {
    const queue: Array<() => void> = [];
    const posted: FromWorker[] = [];
    const host = createAiHost(m => posted.push(m), fn => queue.push(fn), 4);
    const runAll = (): number => { let n = 0; while (queue.length) { (queue.shift() as () => void)(); n++; } return n; };
    return { queue, posted, host, runAll };
}
const pos = positionOf(createGame(configOf(2), 'hote'));
const request = (requestId: string, gameHash = 'h1'): AiRequest => ({ type: 'REQUEST_MOVES', requestId, gameHash, view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'intermediate', budgetNodes: 10_000 });

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
        await expect(answer).resolves.toEqual({ status: 'stale' });
        // Sans changement, la même demande rend la décision.
        const again = client.request({ type: 'REQUEST_MOVES', gameHash: 'h2', view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'beginner', budgetNodes: 10_000 }, () => current);
        m.runAll();
        for (const p of m.posted.slice(1)) for (const l of listeners) l({ data: p });
        await expect(again).resolves.toMatchObject({ status: 'ok', decision: { move: { type: 'PLACE' } } });
        // Annuler côté client résout la demande tout de suite.
        const cancelled = client.request({ type: 'REQUEST_MOVES', gameHash: 'h3', view: pos.view, hand: pos.hand, playerId: pos.playerId, level: 'beginner', budgetNodes: 10_000 }, () => 'h3');
        client.cancel();
        await expect(cancelled).resolves.toEqual({ status: 'cancelled' });
        expect(stateHash(pos.state)).toMatch(/^[0-9a-f]{16}$/);
    });
    it('ERROR is posted when the view is malformed', () => {
        const m = manual();
        m.host({ ...request('bad'), view: null } as unknown as ToWorker);
        m.host({ ...request('bad2'), hand: ['t-999'] });
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
    m.host({ ...request('hint'), type: 'REQUEST_HINT' });
    expect(m.runAll()).toBeGreaterThan(0);
    m.host({ ...request('cached-hint'), type: 'REQUEST_HINT' });
    expect(m.runAll()).toBe(0);
    const [move, hint, cached] = m.posted;
    expect(move).toMatchObject({ type: 'RESULT', requestId: 'move', decision: { move: { type: 'PLACE' } } });
    expect(hint).toEqual({ ...move, requestId: 'hint' });
    expect(cached).toEqual({ ...hint, requestId: 'cached-hint' });
});

it('cache key includes the node budget', () => {
    const m = manual();
    m.host({ ...request('large'), budgetNodes: 10 });
    m.runAll();
    m.host({ ...request('small'), budgetNodes: 1 });
    expect(m.runAll()).toBeGreaterThan(0);
    expect(m.posted[1]).toMatchObject({ type: 'RESULT', decision: { evaluatedNodes: 1 } });
});

it('cache evicts the least recently used decision', () => {
    const m = manual();
    const lookup = (i: number) => {
        m.host({ ...request(`r${i}`, `h${i}`), budgetNodes: 1 });
        return m.runAll();
    };
    for (let i = 0; i < 64; i++) expect(lookup(i)).toBeGreaterThan(0);
    expect(lookup(0)).toBe(0);
    expect(lookup(64)).toBeGreaterThan(0);
    expect(lookup(0)).toBe(0);
    expect(lookup(1)).toBeGreaterThan(0);

    const concurrent = manual();
    concurrent.host({ ...request('premier', 'h0'), budgetNodes: 1 });
    concurrent.host({ ...request('retardé', 'h0'), budgetNodes: 1 });
    concurrent.queue.shift()?.();
    const delayed = concurrent.queue.shift();
    if (!delayed) throw new Error('demande concurrente attendue');
    for (let i = 1; i < 64; i++) {
        concurrent.host({ ...request(`r${i}`, `h${i}`), budgetNodes: 1 });
        concurrent.runAll();
    }
    delayed();
    concurrent.host({ ...request('nouveau', 'h64'), budgetNodes: 1 });
    concurrent.runAll();
    concurrent.host({ ...request('récent', 'h0'), budgetNodes: 1 });
    expect(concurrent.runAll()).toBe(0);
    concurrent.host({ ...request('ancien', 'h1'), budgetNodes: 1 });
    expect(concurrent.runAll()).toBeGreaterThan(0);
});

it('CANCEL during move generation stops before RESULT', () => {
    const state = stateFrom({
        board: Array.from({ length: 12 }, (_, i) => [i * 3, 0, 0, i % 4]),
        hands: [[[5, 5]], [[4, 4]]], bagCount: 0
    });
    const { view, hand, playerId } = positionOf(state);
    const m = manual();
    m.host({ ...request('annulation'), view, hand, playerId });
    m.queue.shift()?.();
    expect(m.posted).toEqual([]);
    expect(m.queue).toHaveLength(1);
    m.host({ type: 'CANCEL', requestId: 'annulation' });
    m.runAll();
    expect(m.posted).toEqual([]);
});

it('the client times out, cancels and ignores a late reply to an expired request', async () => {
    vi.useFakeTimers();
    try {
        const sent: ToWorker[] = [];
        let receive: (event: { data: FromWorker }) => void = () => {};
        const client = new AiClient({
            addEventListener: (_, fn) => { receive = fn; },
            postMessage: message => { sent.push(message); }
        }, 10);
        const original = client.request(request('initial'), () => 'h1');
        await vi.advanceTimersByTimeAsync(10);
        await expect(original).resolves.toEqual({ status: 'timeout' });
        expect(sent[1]).toEqual({ type: 'CANCEL', requestId: sent[0]?.requestId });

        const next = client.request(request('suivant'), () => 'h1');
        receive({ data: { type: 'ERROR', requestId: sent[0]!.requestId, message: 'En retard' } });
        receive({ data: { type: 'ERROR', requestId: sent[2]!.requestId, message: 'Échec du calcul' } });
        await expect(next).resolves.toEqual({ status: 'error', message: 'Échec du calcul' });
        expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
});

it('the client resolves a synchronous transport exception as an error', async () => {
    const client = new AiClient({
        addEventListener: () => {},
        postMessage: () => { throw new Error('Transport indisponible'); }
    });
    await expect(client.request(request('transport'), () => 'h1')).resolves.toEqual({
        status: 'error', message: 'Error: Transport indisponible'
    });
});
