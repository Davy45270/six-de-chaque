import { describe, expect, it } from 'vitest';
import { initialUi } from '../src/game/controller';
import { keyToCommand } from '../src/game/keyboard';
import { stateFrom } from '../../../packages/engine/test/fixtures';

const config = { players: [{ id: 'p1', name: 'A', type: 'human' as const }, { id: 'p2', name: 'B', type: 'ai' as const, aiLevel: 'beginner' as const }] };
const s = initialUi({ state: stateFrom({ hands: [[[0, 0], [0, 1]], [[5, 5]]], types: ['human', 'ai'] }), events: [] }, config, 'g');
const hand = s.session.state.players[0]?.hand ?? [];

describe('keyboard', () => {
    it('keyboard: arrows, 1-6, Enter, Backspace, Escape, V map to the commands above', () => {
        expect(keyToCommand('ArrowLeft', s)).toEqual({ t: 'moveCursor', dx: -1, dy: 0 });
        expect(keyToCommand('ArrowDown', s)).toEqual({ t: 'moveCursor', dx: 0, dy: 1 });
        expect(keyToCommand('1', s)).toEqual({ t: 'select', tileId: hand[0] });
        expect(keyToCommand('2', s)).toEqual({ t: 'select', tileId: hand[1] });
        expect(keyToCommand('6', s)).toBeNull();
        expect(keyToCommand('Enter', { ...s, cursor: { x: 2, y: 3 } })).toEqual({ t: 'placeAt', x: 2, y: 3 });
        expect(keyToCommand('Backspace', s)).toEqual({ t: 'undoGhost' });
        expect(keyToCommand('Escape', s)).toEqual({ t: 'clearGhost' });
        expect(keyToCommand('v', s)).toEqual({ t: 'validate' });
        expect(keyToCommand('V', s)).toEqual({ t: 'validate' });
        expect(keyToCommand('e', s)).toEqual({ t: 'toggleExchange' });
        expect(keyToCommand('p', s)).toEqual({ t: 'pass' });
        expect(keyToCommand('+', s)).toMatchObject({ t: 'zoom' });
        expect(keyToCommand('i', s)).toEqual({ t: 'hint' });
        expect(keyToCommand('x', s)).toBeNull();
    });
    it('in exchange mode, digits toggle tiles and Enter confirms', () => {
        const ex = { ...s, mode: 'exchange' as const };
        expect(keyToCommand('1', ex)).toEqual({ t: 'toggleExchangeTile', tileId: hand[0] });
        expect(keyToCommand('Enter', ex)).toEqual({ t: 'confirmExchange' });
    });
    it('digit N names the tile announced as N, even after a ghost placement', () => {
        // Les boutons gardent leur numéro (« 2 : … ») quand une tuile est posée en fantôme : la touche 2 désigne
        // toujours la deuxième tuile de la main complète, et la touche d'une tuile déjà posée ne fait rien.
        const placed = { ...s, ghost: [{ tileId: hand[0] ?? '', x: 0, y: 0 }] };
        expect(keyToCommand('2', placed)).toEqual({ t: 'select', tileId: hand[1] });
        expect(keyToCommand('1', placed)).toBeNull();
        expect(keyToCommand('1', { ...placed, mode: 'exchange' as const })).toEqual({ t: 'toggleExchangeTile', tileId: hand[0] });
    });
});
