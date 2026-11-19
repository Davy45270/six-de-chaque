import { expect, it, vi } from 'vitest';
import { AiClient, createAiHost } from '@six-de-chaque/ai';
import type { FromWorker, ToWorker } from '@six-de-chaque/ai';
import { createGame, getLegalMoves, replay, submit, validateAction } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, Session } from '@six-de-chaque/engine';
import { stateFrom } from '../../../packages/engine/test/fixtures';
import { nextAction } from '../../../packages/engine/test/play';
import { chooseAiMove } from '../src/game/ai-turn';

const config: GameConfig = { players: [
    { id: 'humain', name: 'Humain', type: 'human' },
    { id: 'ordi', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner' }
] };
const session: Session = {
    state: Array.from({ length: 20 }, (_, i) => createGame(config, `tour-${i}`)).find(s => s.currentPlayerIndex === 1)!,
    events: []
};

function setup(reply: (message: ToWorker, send: (reply: FromWorker) => void) => void) {
    const sent: ToWorker[] = [];
    let listener: (event: { data: FromWorker }) => void;
    const client = new AiClient({
        addEventListener: (_, fn) => { listener = fn; },
        postMessage: message => { sent.push(message); reply(message, data => listener({ data })); }
    });
    return { client, sent };
}

function expectReplayable(action: GameAction | null) {
    if (!action) throw new Error('Coup attendu');
    const next = submit(session, action);
    expect(next.result.ok).toBe(true);
    expect(next.session.state.turnNumber).toBe(1);
    expect(replay(config, session.state.seed, next.session.events)).toEqual(next.session.state);
}

it('a worker that never answers is detected and the game goes on', async () => {
    vi.useFakeTimers();
    try {
        const { client, sent } = setup(() => {});
        const finished = vi.fn<(action: GameAction | null) => void>();
        const result = chooseAiMove(session, client, () => true).then(move => { finished(move); });
        await vi.advanceTimersByTimeAsync(16_000);
        expect(sent.map(m => m.type)).toEqual(['REQUEST_MOVES', 'CANCEL', 'REQUEST_MOVES', 'CANCEL']);
        expect(finished).toHaveBeenCalledOnce();
        await result;
        expectReplayable(finished.mock.calls[0]?.[0] ?? null);
    } finally { vi.useRealTimers(); }
});

it('a worker ERROR falls back to a legal move', async () => {
    const { client, sent } = setup((message, send) => {
        if (message.type !== 'CANCEL') send({ type: 'ERROR', requestId: message.requestId, message: 'Échec simulé' });
    });
    const move = await chooseAiMove(session, client, () => true);
    expect(sent.flatMap(m => m.type === 'CANCEL' ? [] : [m.budgetNodes])).toEqual([20_000, 5_000]);
    expectReplayable(move);
});

it('a stale answer for the same state is requested again', async () => {
    let attempts = 0;
    const { client, sent } = setup((message, send) => {
        if (message.type === 'CANCEL') return;
        const hash = ++attempts === 1 ? 'autre-empreinte' : message.gameHash;
        createAiHost(send, fn => { fn(); })({ ...message, gameHash: hash });
    });
    expectReplayable(await chooseAiMove(session, client, () => true));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ budgetNodes: 20_000 });
    expect(sent[1]).toMatchObject({ budgetNodes: 20_000 });
});

it('the fallback move is legal and deterministic', async () => {
    const first = await chooseAiMove(session, null, () => true);
    const second = await chooseAiMove(session, null, () => true);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ type: 'PLACE', placements: getLegalMoves(session.state, 'ordi', 1)[0]?.placements });
    expectReplayable(first);
});

it('a stale answer after the state changes leaves the new turn alone', async () => {
    let current = true;
    const { client, sent } = setup((message, send) => {
        if (message.type === 'CANCEL') return;
        current = false;
        createAiHost(send, fn => { fn(); })(message);
    });
    await expect(chooseAiMove(session, client, () => current)).resolves.toBeNull();
    expect(sent).toHaveLength(1);
});

it('the fallback exchanges one tile or passes when no placement exists', async () => {
    const base = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[1, 1]], [[2, 2]]], types: ['ai', 'human'] });
    const dead = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[1, 1]], [[2, 2]]], types: ['ai', 'human'], bagCount: 1 });
    const empty = { ...base, bag: [] };
    for (const [state, type] of [[base, 'EXCHANGE'], [empty, 'PASS'], [dead, 'PASS']] as const) {
        const action = await chooseAiMove({ state, events: [] }, null, () => true);
        expect(action).toMatchObject({ type });
        if (!action) throw new Error('Coup attendu');
        if (action.type === 'EXCHANGE') expect(action.tileIds).toEqual(state.players[0]?.hand.slice(0, 1));
        expect(validateAction(state, action).ok).toBe(true);
    }
});

it("une annulation n'est pas traitée comme une erreur de calcul", async () => {
    const { client, sent } = setup(message => {
        if (message.type === 'REQUEST_MOVES') queueMicrotask(() => { client.cancel(); });
    });
    const move = await chooseAiMove(session, client, () => true);
    expect(sent).toMatchObject([
        { type: 'REQUEST_MOVES', budgetNodes: 20_000 }, { type: 'CANCEL' },
        { type: 'REQUEST_MOVES', budgetNodes: 20_000 }, { type: 'CANCEL' }
    ]);
    expectReplayable(move);
});

function sessionWithCollisions(): Session {
    let current = session;
    for (const actionId of ['repli-2', 'repli-2-']) {
        const next = submit(current, { ...nextAction(current), actionId });
        if (!next.result.ok) throw new Error(next.result.error.detail);
        current = next.session;
    }
    return current;
}

it("un RESULT dont l'actionId est déjà au journal est refusé", async () => {
    const current = sessionWithCollisions();
    const duplicateId = current.events[0]!.actionId;
    const { client, sent } = setup((message, send) => {
        if (message.type === 'CANCEL') return;
        createAiHost(reply => {
            if (reply.type !== 'RESULT') throw new Error('RESULT attendu');
            const move = { ...reply.decision.move, actionId: duplicateId };
            expect(validateAction(current.state, move).ok).toBe(true);
            send({ ...reply, decision: { ...reply.decision, move } });
        }, fn => { fn(); })(message);
    });
    const move = await chooseAiMove(current, client, () => true);
    expect(move).toMatchObject({ actionId: 'repli-2--' });
    expect(sent).toMatchObject([
        { type: 'REQUEST_MOVES', budgetNodes: 20_000 },
        { type: 'REQUEST_MOVES', budgetNodes: 5_000 }
    ]);
});

it("le repli résout plusieurs collisions d'actionId", async () => {
    const current = sessionWithCollisions();
    const move = await chooseAiMove(current, null, () => true);
    expect(move).toMatchObject({ actionId: 'repli-2--' });
    expect(submit(current, move!).result.ok).toBe(true);
});
