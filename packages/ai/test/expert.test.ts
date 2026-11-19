import { expect, it } from 'vitest';
import { checkInvariants, createGame, getLegalMoves, seedToState, validateAction } from '@six-de-chaque/engine';
import { decide, decideNow } from '../src/policies';
import { EXPERT_CANDIDATES, sampleHiddenState, simulateReplies } from '../src/expert';
import { configOf } from '../../engine/test/play';
import { positionOf, positions } from './positions';

it('expert is reproducible for a given view', () => {
    let changed = false;
    for (const { view, hand, playerId, passLegal, state } of positions('expert', 8)) {
        const result = decideNow(view, hand, playerId, 'expert', 512, state.turnNumber, passLegal);
        expect(result).toEqual(decideNow(structuredClone(view), [...hand], playerId, 'expert', 512, state.turnNumber, passLegal));
        expect(validateAction(state, result.move)).toEqual({ ok: true });
        const advanced = decideNow(view, hand, playerId, 'advanced', 512, state.turnNumber, passLegal);
        if (JSON.stringify(result.move) !== JSON.stringify(advanced.move)) {
            expect(result.evaluatedNodes).toBeGreaterThan(advanced.evaluatedNodes);
            changed = true;
        }
    }
    expect(changed).toBe(true);
});

it('expert never exceeds its node budget', () => {
    const opening = positionOf(createGame(configOf(2), 'expert'));
    const middle = positions('expert', 14).at(-1)!;
    const { view, hand, playerId } = opening;
    expect(() => decideNow(view, hand, playerId, 'expert', 0, 0)).toThrow(/budget/i);
    for (const [budget, { view, hand, playerId, state }] of [
        [1, opening], [2, opening], [10, opening], [64, middle], [512, middle]
    ] as const) {
        const search = decide(view, hand, playerId, 'expert', budget, state.turnNumber);
        let nodes = 0;
        let result = search.next();
        while (!result.done) { nodes += result.value; result = search.next(); }
        expect(result.value.evaluatedNodes).toBe(nodes);
        expect(nodes).toBeLessThanOrEqual(budget);
        expect(nodes).toBeGreaterThan(0);
        expect(validateAction(state, result.value.move)).toEqual({ ok: true });
    }
});

it('expert only samples tiles that are not visible', () => {
    const state = createGame(configOf(4), 'distribution');
    const { view, hand, playerId } = positionOf(state);
    const sampleView = { ...view, board: { '0:0': state.bag[0]! }, bagCount: view.bagCount - 1 };
    sampleView.phase = 'playing';
    const visible = new Set([...Object.values(sampleView.board), ...hand]);
    const layouts = new Set<string>();
    for (let i = 0; i < 8; i++) {
        const sampled = sampleHiddenState(sampleView, hand, playerId, seedToState(`sample-${i}`));
        expect(sampled.players.map(p => p.hand.length)).toEqual(view.players.map(p => p.handCount));
        expect(sampled.players.find(p => p.id === playerId)?.hand).toEqual(hand);
        expect(sampled.bag).toHaveLength(sampleView.bagCount);
        const hidden = [...sampled.players.filter(p => p.id !== playerId).flatMap(p => p.hand), ...sampled.bag];
        expect(hidden.some(id => visible.has(id))).toBe(false);
        expect(checkInvariants(sampled)).toEqual([]);
        layouts.add(hidden.join(','));
    }
    expect(layouts.size).toBe(8);
});

// À budget fixé, le choix de l'étage expert (`simulateReplies`, appelé par `decide` avec la graine dérivée de la
// vue) dépend de l'échantillonnage des tuiles cachées : la graine `${graine}:${essai}` fixe chaque répartition.
// Cas documenté : partie « expert », position du tour 4, quatre candidats (valeurs 10/10/9/7) classés par points ;
// à 256 nœuds, l'échantillonnage « s0 » et l'échantillonnage « s1 » retiennent deux poses différentes.
it('at a fixed budget the expert choice depends on its sampling of hidden tiles', () => {
    const BUDGET = 256;
    const position = positions('expert', 14).find(p => p.state.turnNumber === 4);
    if (!position) throw new Error('position du tour 4 absente');
    const { view, hand, playerId, state } = position;
    const candidates = getLegalMoves(state, playerId)
        .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))
        .slice(0, EXPERT_CANDIDATES)
        .map(move => ({ move, value: move.score }));
    expect(candidates.map(c => c.value)).toEqual([10, 10, 9, 7]);
    const base = { actorId: playerId, expectedTurn: state.turnNumber, actionId: 'echantillon' };
    const choose = (sampling: string): { key: string; nodes: number } => {
        const search = simulateReplies(structuredClone(view), [...hand], base, candidates, sampling, BUDGET);
        let nodes = 0;
        let result = search.next();
        while (!result.done) { nodes += result.value; result = search.next(); }
        return { key: result.value.key, nodes };
    };
    // Les deux échantillonnages répartissent différemment les tuiles cachées.
    const hidden = (sampling: string): string => {
        const sampled = sampleHiddenState(view, hand, playerId, seedToState(`${sampling}:0`));
        return [...sampled.players.filter(p => p.id !== playerId).flatMap(p => p.hand), ...sampled.bag].join(',');
    };
    expect(hidden('s0')).not.toBe(hidden('s1'));
    const first = choose('s0');
    const second = choose('s1');
    // Même budget consommé, choix différents : seule la répartition des tuiles cachées a changé.
    expect(first.nodes).toBeLessThanOrEqual(BUDGET);
    expect(second.nodes).toBe(first.nodes);
    expect(candidates.map(c => c.move.key)).toContain(first.key);
    expect(candidates.map(c => c.move.key)).toContain(second.key);
    expect(second.key).not.toBe(first.key);
    // Le même échantillonnage redonne le même choix.
    expect(choose('s0')).toEqual(first);
    expect(choose('s1')).toEqual(second);
});
