import { afterEach, expect, it, vi } from 'vitest';
import { decide } from '@six-de-chaque/ai';
import { validateAction } from '@six-de-chaque/engine';
import type { Session } from '@six-de-chaque/engine';
import { stateFrom } from '../../../packages/engine/test/fixtures';
import { chooseAiMove } from '../src/game/ai-turn';

vi.mock('@six-de-chaque/ai', async importOriginal => ({
    ...await importOriginal<typeof import('@six-de-chaque/ai')>(),
    decide: vi.fn<typeof decide>()
}));

afterEach(() => { vi.resetAllMocks(); });

const session: Session = {
    state: stateFrom({ hands: [[[0, 0], [0, 1]], [[1, 1]]], types: ['ai', 'human'] }),
    events: []
};

function searchUntilBudget(onNode: () => void) {
    vi.mocked(decide).mockImplementation(function* (_view, hand, playerId, level, budget, turn) {
        expect(level).toBe('beginner');
        expect(Number.isSafeInteger(budget) && budget > 0).toBe(true);
        for (let i = 0; i < budget; i++) {
            onNode();
            yield 1;
        }
        return {
            move: {
                type: 'PLACE', actorId: playerId, expectedTurn: turn, actionId: 'recherche',
                placements: [{ tileId: hand[1]!, x: 0, y: 0 }]
            },
            explanation: '', evaluatedNodes: budget, seed: ''
        };
    });
}

it('the fallback AI search stops at its node budget and still returns a legal action', async () => {
    const node = vi.fn();
    searchUntilBudget(node);
    const move = await chooseAiMove(session, null, () => true);
    expect(decide).toHaveBeenCalledOnce();
    expect(node).toHaveBeenCalledTimes(vi.mocked(decide).mock.calls[0]![4]);
    expect(move).toMatchObject({ type: 'PLACE', placements: [{ tileId: session.state.players[0]!.hand[1], x: 0, y: 0 }] });
    expect(validateAction(session.state, move!).ok).toBe(true);
});

it('the fallback AI search is abandoned when the turn is no longer current', async () => {
    const node = vi.fn();
    searchUntilBudget(node);
    let current = true;
    let nodesAtCancellation = 0;
    const cancel = new Promise<void>(resolve => setTimeout(() => {
        nodesAtCancellation = node.mock.calls.length;
        current = false;
        resolve();
    }, 0));
    const result = chooseAiMove(session, null, () => current);
    await cancel;
    await expect(result).resolves.toBeNull();
    expect(nodesAtCancellation).toBeGreaterThan(0);
    expect(node).toHaveBeenCalledTimes(nodesAtCancellation);
});

it('the fallback AI yields to the event loop between slices', async () => {
    let nodes = 0;
    searchUntilBudget(() => { nodes++; });
    const betweenSlices = new Promise<number>(resolve => setTimeout(() => resolve(nodes), 0));
    const result = chooseAiMove(session, null, () => true);
    const observed = await betweenSlices;
    await result;
    expect(observed).toBeGreaterThan(0);
    expect(observed).toBeLessThan(nodes);
});
