import { describe, expect, it } from 'vitest';
import { createGame, GAME_VERSION, tileId } from '@six-de-chaque/engine';
import type { Session } from '@six-de-chaque/engine';
import { deadChoice, initialUi, passLegal, reduce, withSession } from '../src/game/controller';
import { startChallenge } from '../src/game/challenge';
import type { UiState } from '../src/game/controller';
import { stateFrom } from '../../../packages/engine/test/fixtures';

const config = { players: [{ id: 'p1', name: 'Alice', type: 'human' as const }, { id: 'p2', name: 'Ordinateur', type: 'ai' as const, aiLevel: 'beginner' as const }] };
const ui = (session: Session): UiState => initialUi(session, config, 'g');
const opening = (): UiState => ui({ state: stateFrom({ hands: [[[0, 0], [0, 1], [1, 1], [2, 2]], [[5, 5]]], types: ['human', 'ai'] }), events: [] });
const run = (s: UiState, ...cmds: Parameters<typeof reduce>[1][]): UiState => cmds.reduce((a, c) => reduce(a, c).state, s);
const hand = (s: UiState): string[] => s.session.state.players[0]?.hand ?? [];

describe('controller', () => {
    it('select then placeAt builds a ghost and a score preview', () => {
        const s0 = opening();
        const [a, b] = hand(s0);
        const s = run(s0, { t: 'select', tileId: a ?? '' }, { t: 'placeAt', x: 0, y: 0 }, { t: 'select', tileId: b ?? '' }, { t: 'placeAt', x: 1, y: 0 });
        expect(s.ghost).toEqual([{ tileId: a, x: 0, y: 0 }, { tileId: b, x: 1, y: 0 }]);
        expect(s.preview?.total).toBe(2);
        expect(s.previewError).toBeNull();
        expect(s.cursor).toEqual({ x: 1, y: 0 });
        expect(s.selected).toBeNull();
    });
    it('the score preview includes the final six points only with an empty bag and hand', () => {
        const tile = tileId(0, 1, 0);
        const preview = (state: ReturnType<typeof stateFrom>) =>
            run(ui({ state, events: [] }), { t: 'select', tileId: tile }, { t: 'placeAt', x: 1, y: 0 }).preview;
        const last = stateFrom({ board: [[0, 0, 0, 0]], hands: [[[0, 1]], [[5, 5]]], bagCount: 0 });
        expect(preview(last)).toMatchObject({ total: 8, finalBonus: 6 });
        expect(preview({ ...last, bag: [tileId(1, 0, 0)] })).toMatchObject({ total: 2, finalBonus: 0 });
        expect(preview(stateFrom({ board: [[0, 0, 0, 0]], hands: [[[0, 1], [0, 2]], [[5, 5]]], bagCount: 0 }))).toMatchObject({ total: 2, finalBonus: 0 });
    });
    it('invalid ghost shows the engine detail and blocks validate', () => {
        const s0 = opening();
        const [a, , , d] = hand(s0);
        const s = run(s0, { t: 'select', tileId: a ?? '' }, { t: 'placeAt', x: 0, y: 0 }, { t: 'select', tileId: d ?? '' }, { t: 'placeAt', x: 1, y: 0 });
        expect(s.preview).toBeNull();
        expect(s.previewError).toMatch(/couleur ou un glyphe/);
        expect(reduce(s, { t: 'validate' }).submit).toBeUndefined();
    });
    it('validate submits a PLACE with expectedTurn and a fresh actionId', () => {
        const s0 = opening();
        const s = run(s0, { t: 'select', tileId: hand(s0)[0] ?? '' }, { t: 'placeAt', x: 3, y: -2 });
        const r = reduce(s, { t: 'validate' });
        expect(r.submit).toEqual({ type: 'PLACE', actorId: 'p1', expectedTurn: 0, actionId: 'g-0-pose', placements: [{ tileId: hand(s0)[0], x: 3, y: -2 }] });
        const later = reduce({ ...s, session: { ...s.session, state: { ...s.session.state, turnNumber: 7 } } }, { t: 'validate' });
        expect(later.submit?.actionId).not.toBe(r.submit?.actionId);
    });
    it('clearGhost restores the hand', () => {
        const s0 = opening();
        const s = run(s0, { t: 'select', tileId: hand(s0)[0] ?? '' }, { t: 'placeAt', x: 0, y: 0 }, { t: 'clearGhost' });
        expect(s.ghost).toEqual([]);
        expect(s.preview).toBeNull();
        const undo = run(s0, { t: 'select', tileId: hand(s0)[0] ?? '' }, { t: 'placeAt', x: 0, y: 0 }, { t: 'select', tileId: hand(s0)[1] ?? '' }, { t: 'placeAt', x: 1, y: 0 }, { t: 'undoGhost' });
        expect(undo.ghost).toHaveLength(1);
        // Toucher un fantôme sans tuile choisie le reprend.
        expect(run(undo, { t: 'placeAt', x: 0, y: 0 }).ghost).toEqual([]);
    });
    it('exchange mode submits the selected tiles', () => {
        const st = stateFrom({ board: [[0, 0, 4, 4]], hands: [[[0, 0], [0, 1], [1, 1]], [[5, 5]]], types: ['human', 'ai'] });
        const s0 = ui({ state: st, events: [] });
        const [a, b] = hand(s0);
        const s = run(s0, { t: 'toggleExchange' }, { t: 'select', tileId: a ?? '' }, { t: 'toggleExchangeTile', tileId: b ?? '' }, { t: 'toggleExchangeTile', tileId: a ?? '' }, { t: 'toggleExchangeTile', tileId: a ?? '' });
        expect(s.mode).toBe('exchange');
        expect(reduce(s, { t: 'confirmExchange' }).submit).toMatchObject({ type: 'EXCHANGE', tileIds: [b, a] });
        expect(run(opening(), { t: 'toggleExchange' }).mode).toBe('place');
    });
    it('pass command is ignored unless PASS is legal', () => {
        const s0 = opening();
        expect(passLegal(s0.session)).toBe(false);
        expect(reduce(s0, { t: 'pass' }).submit).toBeUndefined();
        const blocked = ui({ state: stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1]], [[0, 0, 2]]], bagCount: 0, types: ['human', 'ai'] }), events: [] });
        expect(reduce(blocked, { t: 'pass' }).submit).toMatchObject({ type: 'PASS', actorId: 'p1' });
        expect(deadChoice(blocked.session)).toBe(false);
    });
    it('dead position with tiles in the bag: pass or exchange part of the hand', () => {
        const base = stateFrom({ board: [[0, 0, 0, 0, 0]], hands: [[[0, 0, 1], [3, 3, 0]], [[0, 0, 2]]], bagCount: 0, types: ['human', 'ai'] });
        const dead = ui({ state: { ...base, bag: [tileId(1, 1, 0), tileId(2, 2, 0)] }, events: [] });
        expect(deadChoice(dead.session)).toBe(true);
        expect(deadChoice(opening().session)).toBe(false);
        expect(reduce(dead, { t: 'pass' }).submit).toMatchObject({ type: 'PASS' });
        const [a] = hand(dead);
        const s = run(dead, { t: 'toggleExchange' }, { t: 'toggleExchangeTile', tileId: a ?? '' });
        expect(reduce(s, { t: 'confirmExchange' }).submit).toMatchObject({ type: 'EXCHANGE', tileIds: [a] });
    });
    it('the computer turn and the handover screen block every play command', () => {
        const two = { players: [{ id: 'a', name: 'A', type: 'human' as const }, { id: 'b', name: 'B', type: 'human' as const }] };
        const g = createGame(two, 'passe');
        const s = initialUi({ state: g, events: [] }, two, 'g');
        expect(s.handoverFor).toBe(g.players[g.currentPlayerIndex]?.id);
        const id = g.players[g.currentPlayerIndex]?.hand[0] ?? '';
        expect(run(s, { t: 'select', tileId: id }).selected).toBeNull();
        expect(run(s, { t: 'handoverDone' }, { t: 'select', tileId: id }).selected).toBe(id);
        const aiTurn = withSession(opening(), { state: { ...opening().session.state, currentPlayerIndex: 1 }, events: [] });
        expect(run(aiTurn, { t: 'select', tileId: tileId(5, 5, 0) }).selected).toBeNull();
        expect(aiTurn.handoverFor).toBeNull();
    });
});

it('on resume the keyboard cursor starts on the board, not at the origin', () => {
    const state = stateFrom({ board: [[40, 40, 0, 0]], hands: [[[0, 1]], [[0, 2]]], turn: 1 });
    expect(ui({ state, events: [] }).cursor).toEqual({ x: 40, y: 40 });
});

it('a new challenge starts with the keyboard cursor at the origin', () => {
    const { ui } = startChallenge({
        seed: 'défi-curseur', ruleVersion: GAME_VERSION, turnLimit: 1, targetScore: 2,
        board: { '1:0': tileId(0, 0, 0) }, hand: [tileId(0, 1, 0)], drawPolicy: 'none'
    });
    expect(ui.cursor).toEqual({ x: 0, y: 0 });
});
