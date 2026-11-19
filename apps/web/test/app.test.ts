// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAiHost } from '@six-de-chaque/ai';
import type { FromWorker, ToWorker } from '@six-de-chaque/ai';
import { createGame, getLegalMoves, submit } from '@six-de-chaque/engine';
import type { GameConfig } from '@six-de-chaque/engine';
import { App } from '../src/App';
import { initialUi } from '../src/game/controller';
import type { Play } from '../src/screens/Play';

const rendered = vi.hoisted(() => ({ play: null as Parameters<typeof Play>[0] | null }));
vi.mock('../src/screens/Play', () => ({
    Play: (props: Parameters<typeof Play>[0]) => {
        rendered.play = props;
        return null;
    }
}));
vi.mock('../src/storage/db', async importOriginal => ({
    ...await importOriginal<typeof import('../src/storage/db')>(),
    openDb: () => new Promise<IDBDatabase>(() => {})
}));

const sent: ToWorker[] = [];
let deliver: (message: FromWorker) => void;
class WorkerStub {
    addEventListener(_: string, listener: (event: { data: FromWorker }) => void) {
        deliver = data => { listener({ data }); };
    }
    postMessage(message: ToWorker) { sent.push(message); }
    terminate() {}
}

const config: GameConfig = { players: [
    { id: 'humain', name: 'Humain', type: 'human' },
    { id: 'ordi', name: 'Ordinateur', type: 'ai', aiLevel: 'beginner' }
] };
const opening = {
    state: Array.from({ length: 20 }, (_, i) => createGame(config, `indice-${i}`)).find(state => state.currentPlayerIndex === 1)!,
    events: []
};
const firstMove = getLegalMoves(opening.state, 'ordi', 1)[0]!;
const humanTurn = submit(opening, {
    type: 'PLACE', actorId: 'ordi', expectedTurn: 0, actionId: 'ouverture', placements: firstMove.placements
}).session;

const root = () => createRoot(document.createElement('div'));
let mounted: ReturnType<typeof root>;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('Worker', WorkerStub);
    vi.useFakeTimers();
    sent.length = 0;
    rendered.play = null;
    mounted = root();
});

afterEach(() => {
    act(() => { mounted.unmount(); });
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function play(session = humanTurn) {
    act(() => {
        mounted.render(createElement(App, { example: { screen: 'play', ui: initialUi(session, config, 'exemple') } }));
    });
}

async function deliverHint() {
    const request = sent[0];
    if (request?.type !== 'REQUEST_HINT') throw new Error('Demande d’indice attendue');
    await act(() => Promise.resolve().then(() => { createAiHost(deliver, fn => { fn(); })(request); }));
}

it('applies a hint after cursor navigation', async () => {
    play();
    act(() => { rendered.play!.dispatch({ t: 'hint' }); });
    act(() => { rendered.play!.dispatch({ t: 'moveCursor', dx: 1, dy: 0 }); });
    await deliverHint();
    expect(rendered.play!.ui.preview).not.toBeNull();
    expect(rendered.play!.ui.cursor).toEqual({ x: 1, y: 0 });
});

it('a late hint does not overwrite a ghost the player has edited since', async () => {
    play();
    act(() => { rendered.play!.dispatch({ t: 'hint' }); });
    const tileId = humanTurn.state.players[0]!.hand[0]!;
    act(() => { rendered.play!.dispatch({ t: 'select', tileId }); });
    act(() => { rendered.play!.dispatch({ t: 'placeAt', x: 4, y: 4 }); });
    const edited = [{ tileId, x: 4, y: 4 }];
    expect(rendered.play!.ui.ghost).toEqual(edited);
    await deliverHint();
    expect(rendered.play!.ui.ghost).toEqual(edited);
});

it('a late hint does not leave exchange mode', async () => {
    play();
    act(() => { rendered.play!.dispatch({ t: 'hint' }); });
    act(() => { rendered.play!.dispatch({ t: 'toggleExchange' }); });
    const tileId = humanTurn.state.players[0]!.hand[0]!;
    act(() => { rendered.play!.dispatch({ t: 'toggleExchangeTile', tileId }); });
    await deliverHint();
    expect(rendered.play!.ui).toMatchObject({ mode: 'exchange', exchangeSel: [tileId], ghost: [] });
});

it('quitter la partie pendant le calcul envoie CANCEL', async () => {
    play(opening);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(sent).toEqual([expect.objectContaining({ type: 'REQUEST_MOVES' })]);
    act(() => { rendered.play!.onMenu(); });
    expect(sent[1]).toEqual({ type: 'CANCEL', requestId: sent[0]!.requestId });
});
