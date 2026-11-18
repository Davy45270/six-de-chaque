// Validateurs des contrats publics : un état de partie (instantané) et une action. Compilés une fois.
import Ajv2020 from 'ajv/dist/2020.js';
import type { GameAction, GameState } from '@six-de-chaque/engine/types';
import gameSchema from '../schemas/game.schema.json';
import actionsSchema from '../schemas/actions.schema.json';

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
const checkGame = ajv.compile(gameSchema);
const checkAction = ajv.compile(actionsSchema);

function run<T>(check: typeof checkGame, value: unknown): Checked<T> {
    if (check(value)) return { ok: true, value: value as T };
    const errors = (check.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message ?? 'invalide'}`);
    return { ok: false, errors };
}
export const validateGameSnapshot = (value: unknown): Checked<GameState> => run<GameState>(checkGame, value);
export const validateGameAction = (value: unknown): Checked<GameAction> => run<GameAction>(checkAction, value);
export { gameSchema, actionsSchema };
