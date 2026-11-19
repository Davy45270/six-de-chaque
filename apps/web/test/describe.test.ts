import { expect, it } from 'vitest';
import { applyAction, tileId } from '@six-de-chaque/engine';
import { stateFrom } from '../../../packages/engine/test/fixtures';
import { describeEvent } from '../src/game/describe';

it('the history never names exchanged tiles', () => {
    const first = tileId(0, 0, 0);
    const second = tileId(2, 2, 0);
    const state = stateFrom({ board: [[0, 0, 1, 1]], hands: [[[0, 0], [2, 2]], [[5, 5]]] });
    const config = { players: state.players.map(({ id, name, type }) => ({ id, name, type })) };
    for (const [tileIds, text] of [
        [[first], 'Joueur 1 échange 1 tuile.'],
        [[first, second], 'Joueur 1 échange 2 tuiles.']
    ] as const) {
        const result = applyAction(state, { type: 'EXCHANGE', actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'échange', tileIds: [...tileIds] });
        if (!result.ok) throw new Error(result.error.detail);
        expect(describeEvent(result.event, config, state.tilesById)).toBe(text);
    }
});
