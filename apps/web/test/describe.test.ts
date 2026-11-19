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

// Le joueur humain s'appelle « Toi » par défaut : « Toi passe » se lit mal, on lui parle à la deuxième personne.
// Les autres noms gardent la troisième personne, et la pose garde la forme « Nom : … » pour tous.
for (const [name, pass, exchange] of [
    ['Toi', 'Tu passes.', 'Tu échanges 1 tuile.'],
    ['Camille', 'Camille passe.', 'Camille échange 1 tuile.']
] as const) {
    const setup = () => {
        const state = stateFrom({ board: [[0, 0, 1, 1]], hands: [[[0, 0], [2, 2]], [[5, 5]]], types: ['human', 'ai'] });
        const config = { players: state.players.map(({ id, type }, i) => ({ id, name: i === 0 ? name : 'Ordinateur', type })) };
        const exchanged = applyAction(state, { type: 'EXCHANGE', actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'échange', tileIds: [tileId(0, 0, 0)] });
        if (!exchanged.ok) throw new Error(exchanged.error.detail);
        return { state, config, event: exchanged.event };
    };
    it(`an exchange by ${name} reads « ${exchange} »`, () => {
        const { state, config, event } = setup();
        expect(describeEvent(event, config, state.tilesById)).toBe(exchange);
    });
    it(`a pass by ${name} reads « ${pass} »`, () => {
        const { state, config, event } = setup();
        const passed = { ...event, action: { type: 'PASS' as const, actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'passe' } };
        expect(describeEvent(passed, config, state.tilesById)).toBe(pass);
    });
}

it('a placement by Toi keeps the « Toi : » form', () => {
    const state = stateFrom({ board: [[0, 0, 1, 1]], hands: [[[1, 0], [2, 2]], [[5, 5]]] });
    const config = { players: state.players.map(({ id, type }, i) => ({ id, name: i === 0 ? 'Toi' : 'Ordinateur', type })) };
    const placed = applyAction(state, { type: 'PLACE', actorId: 'p1', expectedTurn: state.turnNumber, actionId: 'pose', placements: [{ tileId: tileId(1, 0, 0), x: 1, y: 0 }] });
    if (!placed.ok) throw new Error(placed.error.detail);
    expect(describeEvent(placed.event, config, state.tilesById)).toMatch(/^Toi : .* en 1, 0 — \d+ points?\.$/);
});

// La deuxième personne est réservée au seul joueur humain nommé « Toi ». Une IA ou un second humain qui porte ce
// nom est un adversaire : on le nomme à la troisième personne.
const spoken = (types: Array<'human' | 'ai'>, actor: string) => {
    const state = stateFrom({ board: [[0, 0, 1, 1]], hands: [[[0, 0], [2, 2]], [[5, 5]]], types });
    const config = { players: state.players.map(({ id, type, aiLevel }) => ({ id, name: 'Toi', type, ...(aiLevel ? { aiLevel } : {}) })) };
    const exchange = { type: 'EXCHANGE' as const, actorId: actor, expectedTurn: state.turnNumber, actionId: 'échange', tileIds: [tileId(0, 0, 0)] };
    const exchanged = applyAction({ ...state, currentPlayerIndex: actor === 'p1' ? 0 : 1 }, actor === 'p1' ? exchange : { ...exchange, tileIds: [tileId(5, 5, 0)] });
    if (!exchanged.ok) throw new Error(exchanged.error.detail);
    const passed = { ...exchanged.event, action: { type: 'PASS' as const, actorId: actor, expectedTurn: state.turnNumber, actionId: 'passe' } };
    return [describeEvent(exchanged.event, config, state.tilesById), describeEvent(passed, config, state.tilesById)];
};

it('a computer named Toi is spoken of in the third person', () => {
    expect(spoken(['human', 'ai'], 'p2')).toEqual(['Toi échange 1 tuile.', 'Toi passe.']);
});

it('two humans named Toi are spoken of in the third person', () => {
    expect(spoken(['human', 'human'], 'p1')).toEqual(['Toi échange 1 tuile.', 'Toi passe.']);
    expect(spoken(['human', 'human'], 'p2')).toEqual(['Toi échange 1 tuile.', 'Toi passe.']);
});
