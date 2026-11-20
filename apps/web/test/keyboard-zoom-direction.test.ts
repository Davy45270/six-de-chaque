import { expect, it } from 'vitest';
import { initialUi } from '../src/game/controller';
import { keyToCommand } from '../src/game/keyboard';
import { stateFrom } from '../../../packages/engine/test/fixtures';

const config = { players: [{ id: 'p1', name: 'A', type: 'human' as const }, { id: 'p2', name: 'B', type: 'ai' as const, aiLevel: 'beginner' as const }] };
const s = initialUi({ state: stateFrom({ hands: [[[0, 0]], [[5, 5]]], types: ['human', 'ai'] }), events: [] }, config, 'g');

const factorOf = (key: string): number => {
    const command = keyToCommand(key, s);
    if (command?.t !== 'zoom') throw new Error(`la touche ${key} ne zoome pas`);
    return command.factor;
};

it('the - key zooms out while + and = zoom in', () => {
    expect(factorOf('-')).toBeLessThan(1);
    expect(factorOf('+')).toBeGreaterThan(1);
    expect(factorOf('=')).toBeGreaterThan(1);
});
