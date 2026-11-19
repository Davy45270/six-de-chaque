// Vérification et migration sans écriture. Les empreintes historiques sont vérifiées avant remplacement.
import { validateGameAction, validateGameSnapshot, validateGameSnapshotV1 } from '@six-de-chaque/contracts';
import { applyAction, canonicalJson, checkInvariants, createGame, DEFAULT_RULES, eventHash, fnv1a64, GAME_VERSION, GENESIS_HASH, replay, stateHash } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState } from '@six-de-chaque/engine';

export class SaveError extends Error {}
export const CURRENT_VERSION = GAME_VERSION;

interface SaveData {
    version?: unknown;
    config?: unknown;
    snapshot?: unknown;
    events?: unknown;
    checksum?: unknown;
}
export interface CurrentSave extends SaveData {
    version: typeof CURRENT_VERSION;
    snapshot: GameState;
    config: GameConfig;
    events: GameEvent[];
    checksum: string;
}

function versionOf(raw: unknown): unknown {
    return typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined;
}

function checkVersion(version: unknown): asserts version is 1 | typeof CURRENT_VERSION {
    if (version !== 1 && version !== CURRENT_VERSION) {
        throw new SaveError(`Version de sauvegarde inconnue : ${String(version)}.`);
    }
}

export function migrate(raw: unknown): GameState {
    const version = versionOf(raw);
    checkVersion(version);
    let candidate = raw;
    if (version === 1) {
        const strict = validateGameSnapshotV1(raw);
        if (strict.ok) {
            const { players, phase } = strict.value;
            const endReason = phase !== 'finished' ? null : players.some(p => p.hand.length === 0) ? 'out' : 'blocked';
            candidate = {
                ...strict.value, version: CURRENT_VERSION, config: { ...DEFAULT_RULES }, endReason,
                consecutivePasses: endReason === 'blocked' ? players.length : 0,
                players: players.map(p => p.type === 'ai' ? { ...p, aiLevel: 'beginner' } : p)
            };
        } else {
            // Le format publié exigeait déjà les trois champs supplémentaires et un niveau par ordinateur.
            candidate = { ...(raw as object), version: CURRENT_VERSION };
            const extended = validateGameSnapshot(candidate);
            if (extended.ok && extended.value.players.some(p => p.aiLevel === 'advanced' || p.aiLevel === 'expert')) {
                throw new SaveError('Niveau incompatible avec la version de la sauvegarde.');
            }
        }
    }
    const checked = validateGameSnapshot(candidate);
    if (!checked.ok) throw new SaveError(`Sauvegarde invalide : ${checked.errors.slice(0, 3).join(', ')}.`);
    return checked.value;
}

function v1Projection(state: GameState, strict: boolean): unknown {
    if (!strict) return { ...state, version: 1 };
    const { consecutivePasses: _p, config: _c, endReason: _e, players, ...base } = state;
    return { ...base, version: 1, players: players.map(({ aiLevel: _a, ...p }) => p) };
}

const digest = (value: unknown): string => fnv1a64(canonicalJson(value));

export function checkedConfig(raw: unknown, version: 1 | typeof CURRENT_VERSION): GameConfig {
    const config = raw as { players?: unknown; rules?: unknown } | null;
    if (!Array.isArray(config?.players)) throw new SaveError('Configuration de partie invalide.');
    const players: GameConfig['players'] = (config.players as Array<Record<string, unknown> | null>).map(p => {
        if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || (p.type !== 'human' && p.type !== 'ai')) {
            throw new SaveError('Joueur invalide.');
        }
        const { id, name, type } = p;
        if (type === 'human') return { id, name, type };
        const level = p.aiLevel ?? (version === 1 ? 'beginner' : undefined);
        const valid = level === 'beginner' || level === 'intermediate' || (version === CURRENT_VERSION && (level === 'advanced' || level === 'expert'));
        if (!valid) throw new SaveError('Niveau incompatible avec la version de la sauvegarde.');
        return { id, name, type, aiLevel: level };
    });
    if (config.rules === undefined) return { players };
    const rules = config.rules;
    if (!rules || typeof rules !== 'object') throw new SaveError('Règles de partie invalides.');
    const { blockedEndPolicy, coordinateLimit } = rules as Record<string, unknown>;
    if ((blockedEndPolicy !== undefined && blockedEndPolicy !== 'fullPassRound')
        || (coordinateLimit !== undefined && (typeof coordinateLimit !== 'number' || !Number.isInteger(coordinateLimit) || coordinateLimit < 1))) {
        throw new SaveError('Règles de partie invalides.');
    }
    return { players, rules: {
        ...(blockedEndPolicy === undefined ? {} : { blockedEndPolicy }),
        ...(coordinateLimit === undefined ? {} : { coordinateLimit })
    } };
}

export function selectEventFields({ seq, actionId, action, score, finalBonus, prevHash, stateHash, hash }: GameEvent): GameEvent {
    return { seq, actionId, action, score, finalBonus, prevHash, stateHash, hash };
}

export function migrateSave(save: SaveData): CurrentSave {
    checkVersion(save.version);
    if (save.version !== versionOf(save.snapshot)) throw new SaveError('Versions de la sauvegarde et de la partie différentes.');
    const snapshot = migrate(save.snapshot);
    const config = checkedConfig(save.config, save.version);
    const strict = save.version === 1 && validateGameSnapshotV1(save.snapshot).ok;
    const problems = checkInvariants(strict ? { ...snapshot, config: { ...snapshot.config, ...config.rules } } : snapshot);
    if (problems.length) throw new SaveError(`Partie incohérente : ${problems[0]}.`);
    if (!Array.isArray(save.events) || typeof save.checksum !== 'string') throw new SaveError('Sauvegarde incomplète.');
    if ((save.events as unknown[]).some(e => !e || typeof e !== 'object' || !('action' in e) || !Object.hasOwn(e, 'score') || !validateGameAction(e.action).ok)) throw new SaveError('Journal des coups invalide.');
    const oldEvents = save.events as GameEvent[];

    try {
        if (save.version === CURRENT_VERSION) {
            if (stateHash(snapshot) !== save.checksum || canonicalJson(replay(config, snapshot.seed, oldEvents)) !== canonicalJson(snapshot)) {
                throw new SaveError('Le journal des coups ne redonne pas cette partie.');
            }
            return { version: CURRENT_VERSION, config, snapshot, events: oldEvents.map(selectEventFields), checksum: save.checksum };
        }

        let state = createGame(config, snapshot.seed);
        let previous = GENESIS_HASH;
        const events: GameEvent[] = [];
        const ids = new Set<string>();
        for (const old of oldEvents) {
            const next = applyAction(state, old.action, events.at(-1)?.hash ?? GENESIS_HASH);
            if (!next.ok || ids.has(old.actionId) || old.actionId !== old.action.actionId || old.seq !== events.length
                || old.prevHash !== previous || old.stateHash !== digest(v1Projection(next.state, strict))
                || old.hash !== eventHash(previous, old) || canonicalJson(old.score) !== canonicalJson(next.event.score)
                || old.finalBonus !== next.event.finalBonus) {
                throw new SaveError(`Journal v1 incohérent au coup ${events.length + 1}.`);
            }
            ids.add(old.actionId);
            previous = old.hash;
            events.push(next.event);
            state = next.state;
        }
        if (digest(save.snapshot) !== save.checksum || canonicalJson(v1Projection(state, strict)) !== canonicalJson(save.snapshot)) {
            throw new SaveError('Le journal v1 ne redonne pas cette partie.');
        }
        if (!validateGameSnapshot(state).ok) throw new SaveError('Le rejeu produit un instantané invalide.');
        return { version: CURRENT_VERSION, config, snapshot: state, events, checksum: stateHash(state) };
    } catch (error) {
        if (error instanceof SaveError) throw error;
        throw new SaveError('Le journal des coups ne redonne pas cette partie.');
    }
}
