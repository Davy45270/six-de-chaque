import { createGame, stateHash, submit } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, Session } from '@six-de-chaque/engine';
import { initialUi, reduce } from './controller';
import type { UiState } from './controller';

export interface ExampleSource { seed: string; config: GameConfig; actions: GameAction[] }
export interface ExampleEntry { source: string; turn: number; checksum: string; exchange?: boolean }
export interface ExampleData { sources: Record<string, ExampleSource>; examples: Record<string, ExampleEntry> }
export interface OpenExample { ui: UiState; screen: 'play' | 'end' }

export function replayExample(id: string, data: ExampleData): OpenExample {
    const entry = data.examples[id];
    const source = entry && data.sources[entry.source];
    if (!entry || !source || entry.turn < 0 || entry.turn > source.actions.length) throw new Error(`Exemple inconnu : ${id}`);
    let session: Session = { state: createGame(source.config, source.seed), events: [] };
    for (const action of source.actions.slice(0, entry.turn)) {
        const next = submit(session, action);
        if (!next.result.ok) throw new Error(`Exemple ${id}, coup ${action.expectedTurn} : ${next.result.error.detail}`);
        session = next.session;
    }
    if (stateHash(session.state) !== entry.checksum) throw new Error(`Empreinte de l’exemple ${id} différente du rejeu`);
    let ui = initialUi(session, source.config, `exemple-${id}`, 'origin');
    if (entry.exchange) {
        ui = reduce(ui, { t: 'toggleExchange' }).state;
        if (ui.mode !== 'exchange') throw new Error(`Échange indisponible dans l’exemple ${id}`);
    }
    return { ui, screen: session.state.phase === 'finished' ? 'end' : 'play' };
}
