// Rejeu d'un journal depuis la configuration et la graine ; lève au premier écart de la chaîne d'empreintes.
import { applyAction, eventHash, GENESIS_HASH } from './apply';
import type { GameEvent } from './apply';
import { canonicalJson } from './hash';
import { createGame } from './create';
import type { GameConfig, GameState } from './types';

export class ReplayError extends Error {}

export function replay(config: GameConfig, seed: string, events: readonly GameEvent[]): GameState {
    let state = createGame(config, seed);
    let prev = GENESIS_HASH;
    const ids = new Set<string>();
    events.forEach((e, i) => {
        if (e.seq !== i) throw new ReplayError(`événement ${i} : numéro ${e.seq}`);
        if (ids.has(e.actionId)) throw new ReplayError(`événement ${i} : action déjà jouée`);
        if (e.actionId !== e.action.actionId) throw new ReplayError(`événement ${i} : identifiant d’action différent`);
        ids.add(e.actionId);
        if (e.prevHash !== prev) throw new ReplayError(`événement ${i} : chaîne d'empreintes rompue`);
        if (eventHash(prev, e) !== e.hash) throw new ReplayError(`événement ${i} : empreinte altérée`);
        const t = applyAction(state, e.action, prev);
        if (!t.ok) throw new ReplayError(`événement ${i} : action refusée (${t.error.code})`);
        if (t.event.finalBonus !== e.finalBonus) throw new ReplayError(`événement ${i} : bonus final différent`);
        if (!Object.hasOwn(e, 'score') || canonicalJson(t.event.score) !== canonicalJson(e.score)) throw new ReplayError(`événement ${i} : score différent`);
        if (t.event.stateHash !== e.stateHash || t.event.hash !== e.hash) throw new ReplayError(`événement ${i} : état différent au rejeu`);
        state = t.state;
        prev = e.hash;
    });
    return state;
}
