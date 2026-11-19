// Contrôleur pur de l'interface : sélection, fantôme, score prévisionnel, échange, passe, curseur clavier.
// Il ne modifie jamais la partie : il propose une action (`submit`) que l'application soumet au moteur.
import { calculateScore, cellKey, FINAL_BONUS, parseKey, validateAction, validatePlacements } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, Placement, ScoreBreakdown, Session, TileId } from '@six-de-chaque/engine';

export interface UiState {
    session: Session; config: GameConfig; gameId: string;
    selected: TileId | null; ghost: Placement[]; preview: (ScoreBreakdown & { finalBonus: number }) | null; previewError: string | null;
    mode: 'place' | 'exchange'; exchangeSel: TileId[]; cursor: { x: number; y: number }; aiThinking: boolean; handoverFor: string | null;
}
export type UiCommand = { t: 'select'; tileId: TileId } | { t: 'placeAt'; x: number; y: number } | { t: 'undoGhost' } | { t: 'clearGhost' }
    | { t: 'validate' } | { t: 'toggleExchange' } | { t: 'toggleExchangeTile'; tileId: TileId } | { t: 'confirmExchange' } | { t: 'pass' }
    | { t: 'moveCursor'; dx: number; dy: number } | { t: 'handoverDone' } | { t: 'zoom'; factor: number } | { t: 'hint' };

export const currentPlayer = (s: Pick<UiState, 'session'>) => s.session.state.players[s.session.state.currentPlayerIndex];
export const humanCount = (config: GameConfig): number => config.players.filter(p => p.type === 'human').length;
/** La main du joueur courant, sans les tuiles déjà posées en fantôme. */
export const handLeft = (s: UiState): TileId[] => (currentPlayer(s)?.hand ?? []).filter(id => !s.ghost.some(g => g.tileId === id));
export function passLegal(session: Session): boolean {
    const s = session.state;
    const p = s.players[s.currentPlayerIndex];
    return Boolean(p) && validateAction(s, { type: 'PASS', actorId: p?.id ?? '', expectedTurn: s.turnNumber, actionId: 'sonde' }).ok;
}
/** Position morte, réserve non vide : le joueur choisit entre passer et échanger tout ou partie de sa main. */
export function deadChoice(session: Session): boolean {
    return session.state.bag.length > 0 && session.state.phase !== 'opening' && passLegal(session);
}
const actionId = (s: UiState, kind: string): string => `${s.gameId}-${s.session.state.turnNumber}-${kind}`;

/** État d'interface d'une nouvelle position : fantôme vidé, écran de passage si plusieurs humains. */
export function withSession(s: Omit<UiState, 'session'> & { session?: Session }, session: Session): UiState {
    const next = session.state.players[session.state.currentPlayerIndex];
    const handover = session.state.phase !== 'finished' && next?.type === 'human' && humanCount(s.config) >= 2 ? next.id : null;
    return { ...s, session, selected: null, ghost: [], preview: null, previewError: null, mode: 'place', exchangeSel: [], aiThinking: false, handoverFor: handover };
}
export function initialUi(session: Session, config: GameConfig, gameId: string): UiState {
    const cells = Object.keys(session.state.board).map(parseKey);
    let cursor = { x: 0, y: 0 };
    if (cells.length > 0) {
        const xs = cells.map(cell => cell.x);
        const ys = cells.map(cell => cell.y);
        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
        let nearest = Infinity;
        for (const cell of cells) {
            const distance = (cell.x - centerX) ** 2 + (cell.y - centerY) ** 2;
            // À distance égale, ordre de lecture par ligne puis par colonne.
            if (distance < nearest || (distance === nearest && (cell.y < cursor.y || (cell.y === cursor.y && cell.x < cursor.x)))) {
                cursor = cell;
                nearest = distance;
            }
        }
    }
    return withSession({ config, gameId, selected: null, ghost: [], preview: null, previewError: null, mode: 'place', exchangeSel: [], cursor, aiThinking: false, handoverFor: null }, session);
}

function withGhost(s: UiState, ghost: Placement[]): UiState {
    if (ghost.length === 0) return { ...s, ghost, preview: null, previewError: null };
    const game = s.session.state;
    const hand = currentPlayer(s)?.hand ?? [];
    const v = validatePlacements(game, hand, ghost);
    if (!v.ok) return { ...s, ghost, preview: null, previewError: v.detail };
    const score = calculateScore(game.board, ghost);
    const finalBonus = game.bag.length === 0 && ghost.length === hand.length ? FINAL_BONUS : 0;
    return { ...s, ghost, preview: { ...score, total: score.total + finalBonus, finalBonus }, previewError: null };
}

/** Pose un fantôme proposé (indice), avec son score prévisionnel. */
export const setGhost = (s: UiState, ghost: Placement[]): UiState => ({ ...withGhost({ ...s, selected: null, mode: 'place', exchangeSel: [] }, ghost) });

export function reduce(s: UiState, c: UiCommand): { state: UiState; submit?: GameAction } {
    const game = s.session.state;
    const me = currentPlayer(s);
    const myTurn = game.phase !== 'finished' && me?.type === 'human' && s.handoverFor === null && !s.aiThinking;
    if (c.t === 'moveCursor') return { state: { ...s, cursor: { x: s.cursor.x + c.dx, y: s.cursor.y + c.dy } } };
    if (c.t === 'handoverDone') return { state: { ...s, handoverFor: null } };
    if (c.t === 'zoom' || c.t === 'hint' || !myTurn) return { state: s };
    const base = { actorId: me.id, expectedTurn: game.turnNumber };
    switch (c.t) {
        case 'select':
            if (s.mode === 'exchange') return reduce(s, { t: 'toggleExchangeTile', tileId: c.tileId });
            if (!handLeft(s).includes(c.tileId)) return { state: s };
            return { state: { ...s, selected: s.selected === c.tileId ? null : c.tileId } };
        case 'placeAt': {
            const key = cellKey(c.x, c.y);
            const cursor = { x: c.x, y: c.y };
            const inGhost = s.ghost.find(g => cellKey(g.x, g.y) === key);
            if (s.mode !== 'place') return { state: { ...s, cursor } };
            if (inGhost && !s.selected) return { state: { ...withGhost(s, s.ghost.filter(g => g !== inGhost)), cursor } };
            if (!s.selected || inGhost || game.board[key] !== undefined) return { state: { ...s, cursor } };
            const placed = withGhost(s, [...s.ghost, { tileId: s.selected, x: c.x, y: c.y }]);
            return { state: { ...placed, selected: null, cursor } };
        }
        case 'undoGhost': return { state: withGhost({ ...s, selected: null }, s.ghost.slice(0, -1)) };
        case 'clearGhost': return { state: s.mode === 'exchange' ? { ...s, mode: 'place', exchangeSel: [] } : withGhost({ ...s, selected: null }, []) };
        case 'validate':
            if (s.ghost.length === 0 || !s.preview) return { state: s };
            return { state: s, submit: { ...base, type: 'PLACE', actionId: actionId(s, 'pose'), placements: s.ghost.map(g => ({ ...g })) } };
        case 'toggleExchange':
            if (game.phase === 'opening' || game.bag.length === 0) return { state: s };
            return { state: { ...withGhost({ ...s, selected: null }, []), mode: s.mode === 'exchange' ? 'place' : 'exchange', exchangeSel: [] } };
        case 'toggleExchangeTile': {
            if (s.mode !== 'exchange' || !me.hand.includes(c.tileId)) return { state: s };
            const has = s.exchangeSel.includes(c.tileId);
            if (!has && s.exchangeSel.length >= game.bag.length) return { state: s };
            return { state: { ...s, exchangeSel: has ? s.exchangeSel.filter(id => id !== c.tileId) : [...s.exchangeSel, c.tileId] } };
        }
        case 'confirmExchange':
            if (s.mode !== 'exchange' || s.exchangeSel.length === 0) return { state: s };
            return { state: s, submit: { ...base, type: 'EXCHANGE', actionId: actionId(s, 'echange'), tileIds: [...s.exchangeSel] } };
        case 'pass':
            if (!passLegal(s.session)) return { state: s };
            return { state: s, submit: { ...base, type: 'PASS', actionId: actionId(s, 'passe') } };
    }
}
