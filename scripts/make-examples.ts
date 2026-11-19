import { writeFileSync } from 'node:fs';
import { createGame, getLegalMoves, stateHash, submit, validateAction } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, GameState, Session } from '@six-de-chaque/engine';
import type { ExampleData, ExampleSource } from '../apps/web/src/game/examples';

const SOLO: GameConfig = { players: [
    { id: 'j1', name: 'Toi', type: 'human' },
    { id: 'j2', name: 'Ordinateur', type: 'ai', aiLevel: 'intermediate' }
] };
const DUO: GameConfig = { players: [
    { id: 'j1', name: 'Camille', type: 'human' },
    { id: 'j2', name: 'Sacha', type: 'human' }
] };

function firstLegal(state: GameState): GameAction {
    const player = state.players[state.currentPlayerIndex];
    if (!player) throw new Error('Joueur courant absent');
    const base = { actorId: player.id, expectedTurn: state.turnNumber, actionId: `action-${state.turnNumber}` };
    const move = getLegalMoves(state, player.id, 1)[0];
    if (move) return { ...base, type: 'PLACE', placements: move.placements };
    const pass = { ...base, type: 'PASS' } as const;
    if (validateAction(state, pass).ok) return pass;
    return { ...base, type: 'EXCHANGE', tileIds: player.hand.slice(0, 1) };
}

function simulate(config: GameConfig, seed: string, limit = 500): { source: ExampleSource; states: GameState[] } {
    let session: Session = { state: createGame(config, seed), events: [] };
    const states = [session.state];
    const actions: GameAction[] = [];
    while (session.state.phase !== 'finished' && actions.length < limit) {
        const action = firstLegal(session.state);
        const next = submit(session, action);
        if (!next.result.ok) throw new Error(next.result.error.detail);
        actions.push(action);
        session = next.session;
        states.push(session.state);
    }
    return { source: { config, seed, actions }, states };
}

const mark = (source: string, state: GameState) => ({ source, turn: state.turnNumber, checksum: stateHash(state) });

export function makeExamples(): ExampleData {
    const blocked = simulate(SOLO, 'bloc-189');
    const end = blocked.states.at(-1);
    const dead = blocked.states.at(-2);
    if (end?.endReason !== 'blocked' || !dead || dead.currentPlayerIndex !== 0 || dead.bag.length === 0) throw new Error('Fin bloquée introuvable');

    const out = simulate(SOLO, 'sortie-0');
    const empty = out.states.at(-1);
    if (empty?.endReason !== 'out') throw new Error('Fin par main vide introuvable');

    const handover = simulate(DUO, 'rivage', 1);
    const change = simulate(SOLO, 'clavier', 2);
    const turn = change.states[2];
    const handoverState = handover.states[1];
    if (!turn || turn.currentPlayerIndex !== 0 || !handoverState) throw new Error('État d’exemple introuvable');

    return {
        sources: { blocked: blocked.source, out: out.source, handover: handover.source, change: change.source },
        examples: {
            'deux-humains': mark('handover', handoverState),
            'position-morte': mark('blocked', dead),
            fin: mark('blocked', end),
            'fin-main-vide': mark('out', empty),
            echange: { ...mark('change', turn), exchange: true }
        }
    };
}

export function writeExamples(): void {
    const data = makeExamples();
    const json = JSON.stringify(data, null, 2).replace(/\[\n\s+\{\n\s+"actorId":[\s\S]*?\n {6}\]/g, match =>
        '[\n' + (JSON.parse(match) as GameAction[]).map(action => '        ' + JSON.stringify(action)).join(',\n') + '\n      ]');
    writeFileSync('apps/web/data/exemples.json', json + '\n');
}
