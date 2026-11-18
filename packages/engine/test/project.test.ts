import { describe, expect, it } from 'vitest';
import { projectPublicState } from '../src/project';
import { configOf, playGame } from './play';

describe('projectPublicState', () => {
    it('T20 projection hides other hands, bag and seed until the end', () => {
        const { state } = playGame(configOf(3), 'graine-secrete-xyz', { maxTurns: 4 });
        const viewer = state.players[0]?.id ?? '';
        const view = projectPublicState(state, viewer);
        const text = JSON.stringify(view);
        expect(text).not.toContain('graine-secrete-xyz');
        expect(view).not.toHaveProperty('rngState');
        expect(view).not.toHaveProperty('bag');
        expect(view.bagCount).toBe(state.bag.length);
        const onBoard = new Set(Object.values(state.board));
        const hidden = [...state.players.slice(1).flatMap(p => p.hand), ...state.bag].filter(id => !onBoard.has(id));
        // Les identifiants des tuiles cachées n'apparaissent nulle part, sauf dans le dictionnaire public des 108 tuiles.
        const { tilesById: _all, ...rest } = view;
        const restText = JSON.stringify(rest);
        for (const id of hidden) expect(restText).not.toContain(id);
        expect(view.players[0]?.hand).toEqual(state.players[0]?.hand);
        expect(view.players.slice(1).map(p => p.hand)).toEqual([null, null]);
        expect(view.players.map(p => p.handCount)).toEqual(state.players.map(p => p.hand.length));
        expect(JSON.stringify(projectPublicState(state, null).players.map(p => p.hand))).toBe('[null,null,null]');
    });
    it('finished game projection reveals everything', () => {
        const { state } = playGame(configOf(2), 'fin-visible');
        expect(state.phase).toBe('finished');
        const view = projectPublicState(state, null);
        expect(view.players.map(p => p.hand)).toEqual(state.players.map(p => p.hand));
    });
    it('projection does not share references with the state', () => {
        const { state } = playGame(configOf(2), 'refs', { maxTurns: 2 });
        const view = projectPublicState(state, 'h0');
        view.board['99:99'] = 'x';
        view.players[0]?.hand?.push('x');
        expect(state.board['99:99']).toBeUndefined();
        expect(state.players[0]?.hand).not.toContain('x');
    });
});
