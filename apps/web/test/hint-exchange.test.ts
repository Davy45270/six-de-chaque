// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAiHost } from '@six-de-chaque/ai';
import type { FromWorker } from '@six-de-chaque/ai';
import { validateAction } from '@six-de-chaque/engine';
import type { GameConfig, Session } from '@six-de-chaque/engine';
import { playGame } from '../../../packages/engine/test/play';
import { App } from '../src/App';
import { initialUi } from '../src/game/controller';
import data from '../data/exemples.json';
import { replayExample } from '../src/game/examples';
import type { ExampleData } from '../src/game/examples';

vi.mock('../src/components', async importOriginal => ({
    ...await importOriginal<typeof import('../src/components')>(),
    Board: () => null
}));
vi.mock('../src/storage/db', async importOriginal => ({
    ...await importOriginal<typeof import('../src/storage/db')>(),
    openDb: () => new Promise<IDBDatabase>(() => {})
}));

let response: FromWorker | undefined;
class WorkerStub {
    postMessage = createAiHost(data => {
        response = data;
        this.listener?.({ data });
    }, fn => { fn(); });

    private listener?: (event: { data: FromWorker }) => void;
    addEventListener(_: string, listener: (event: { data: FromWorker }) => void) { this.listener = listener; }
    terminate() {}
}

const config: GameConfig = { players: [
    { id: 'alice', name: 'Alice', type: 'human' },
    { id: 'bob', name: 'Bob', type: 'human' }
] };
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('Worker', WorkerStub);
    response = undefined;
    host = document.createElement('div');
    root = createRoot(host);
});

afterEach(() => {
    act(() => { root.unmount(); });
    vi.unstubAllGlobals();
});

async function askForHint(session: Session) {
    const ui = initialUi(session, config, 'exemple');
    act(() => {
        root.render(createElement(App, { example: { screen: 'play', ui: { ...ui, handoverFor: null } } }));
    });
    const hint = [...host.querySelectorAll('button')].find(button => button.textContent === 'Indice');
    if (!hint) throw new Error('Bouton Indice absent');
    await act(() => Promise.resolve().then(() => { hint.click(); }));
    if (response?.type !== 'RESULT') throw new Error(`Réponse d’indice attendue : ${JSON.stringify(response)}`);
    return response.decision;
}

it('a hint advising an exchange selects the advised tiles in exchange mode and announces it', async () => {
    const session = playGame(config, 'revue-2', { maxTurns: 1 });
    const { move, explanation } = await askForHint(session);
    if (move.type !== 'EXCHANGE') throw new Error('Conseil d’échange attendu');

    const hand = host.querySelector('[data-testid="hand"]');
    expect.soft(hand?.getAttribute('aria-label')).toBe('Tuiles à échanger');
    expect.soft([...hand!.querySelectorAll('button[aria-pressed="true"]')].map(tile => tile.getAttribute('data-tile')).sort())
        .toEqual([...move.tileIds].sort());
    expect(host.querySelector('[data-testid="preview"][aria-live="polite"]')?.textContent ?? '').toContain(`Indice : ${explanation}`);
});

it('a hint advising a pass announces it', async () => {
    const position = playGame(config, 'indice-passe-13', { maxTurns: 106 });
    const { move } = await askForHint(position);
    expect(move.type).toBe('PASS');
    expect(host.querySelector('[data-testid="preview"][aria-live="polite"]')?.textContent ?? '')
        .toContain('Indice : aucune pose ni échange possible, tu peux passer.');
});

it('a pass hint in a dead position where exchange is legal says that exchanging is possible', async () => {
    const { ui: { session } } = replayExample('position-morte', data as ExampleData);
    const { state } = session;
    const player = state.players[state.currentPlayerIndex]!;
    expect(validateAction(state, {
        type: 'EXCHANGE', actorId: player.id, expectedTurn: state.turnNumber,
        actionId: 'sonde', tileIds: player.hand.slice(0, 1)
    }).ok).toBe(true);

    const { move } = await askForHint(session);
    expect(move.type).toBe('PASS');
    expect(host.querySelector('[data-testid="preview"][aria-live="polite"]')?.textContent)
        .toContain('Indice : aucune pose possible ; tu peux passer ou échanger.');
});
