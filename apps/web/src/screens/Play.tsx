import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cellKey } from '@six-de-chaque/engine';
import type { GameEvent, PublicGameState, Tile } from '@six-de-chaque/engine';
import { Board, TileImage, tileLabel } from '../components';
import { currentPlayer, deadChoice, handLeft, passLegal } from '../game/controller';
import type { UiCommand, UiState } from '../game/controller';
import { keyToCommand } from '../game/keyboard';
import { describeEvent } from '../game/describe';
import { turnLabel } from '../game/turn-label';
import { exchangeLabel } from '../game/labels';

/** Commandes qui terminent le tour du joueur : valider, passer, confirmer l'échange. */
const endsTurn = (c: UiCommand): boolean => c.t === 'validate' || c.t === 'pass' || c.t === 'confirmExchange';

export interface PlayProps {
    ui: UiState; view: PublicGameState; viewerHand: string[] | null; highContrast: boolean; colourBlind: boolean; announce: string; zoom: { n: number; factor: number };
    saving?: boolean; saveAlert?: ReactNode;
    challenge?: { title: string; turnLimit: number; targetScore: number };
    dispatch(c: UiCommand): void; onMenu(): void;
}
export function Play({ ui, view, viewerHand, highContrast, colourBlind, announce, zoom, dispatch, onMenu, challenge, saving = false, saveAlert }: PlayProps) {
    const me = currentPlayer(ui);
    const myTurn = me?.type === 'human' && ui.handoverFor === null && !ui.aiThinking && view.phase !== 'finished';
    const canAct = myTurn && !saving;
    const tiles = view.tilesById;
    const canPass = !challenge && myTurn && passLegal(ui.session);
    const canExchange = !challenge && myTurn && view.phase !== 'opening' && view.bagCount > 0;
    const dead = !challenge && myTurn && deadChoice(ui.session);
    const cursorId = ui.ghost.find(g => g.x === ui.cursor.x && g.y === ui.cursor.y)?.tileId ?? view.board[cellKey(ui.cursor.x, ui.cursor.y)];
    const cursorTile = cursorId === undefined ? undefined : tiles[cursorId];
    const cursorContent = cursorTile ? tileLabel(cursorTile) : 'vide';
    // Un bouton qui joue le tour se désactive ou disparaît : le focus tomberait sur le corps de la page, laissée
    // défilée vers le bas où le joueur a dû aller chercher le bouton. Le focus va au plateau, où la partie
    // continue, et le haut de l'écran (scores, tour, plateau) revient à la vue. Boutons et raccourcis clavier
    // passent par ce seul chemin.
    const screenRef = useRef<HTMLElement>(null);
    const endTurn = useCallback((c: UiCommand): void => {
        dispatch(c);
        screenRef.current?.querySelector<HTMLElement>('.board')?.focus({ preventScroll: true });
        screenRef.current?.scrollIntoView({ block: 'start' });
    }, [dispatch]);
    // Refus d'une fin de tour au clavier : annoncé tant que l'état de la partie n'a pas changé.
    const [refused, setRefused] = useState<{ text: string; ui: UiState } | null>(null);
    const refusal = useCallback((c: UiCommand): string | null => {
        if (c.t === 'validate') return myTurn && ui.preview ? null : 'Aucun coup prévu';
        if (c.t === 'pass') return canPass ? null : 'Passer n’est pas permis';
        return ui.mode === 'exchange' && ui.exchangeSel.length > 0 ? null : exchangeLabel(0);
    }, [myTurn, canPass, ui]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (saving || e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target instanceof Element ? e.target : null;
            if (target?.closest('.history-scroll') || (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))) return;
            if (e.key === 'Enter' && target?.tagName === 'BUTTON') return;
            const c = keyToCommand(e.key, ui);
            if (!c) return;
            e.preventDefault();
            if (!endsTurn(c)) { dispatch(c); return; }
            // Même règle que les boutons, lue AVANT le coup : une fin de tour refusée ne joue rien, ne bouge ni la
            // vue ni le focus, et le refus est annoncé.
            const reason = refusal(c);
            if (reason === null) endTurn(c); else setRefused({ text: reason, ui });
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
    }, [ui, dispatch, endTurn, refusal, saving]);
    const left = new Set(myTurn ? handLeft(ui) : viewerHand ?? []);
    const history: GameEvent[] = ui.session.events.slice().reverse();
    const shown = (viewerHand ?? []).map(id => tiles[id]).filter((t): t is Tile => t !== undefined);
    return (
        <main className="screen play" ref={screenRef}>
            <header className="status">
                <ul className="players" aria-label="Scores">
                    {view.players.map((p, i) => (
                        <li key={p.id} className={i === view.currentPlayerIndex ? 'current' : ''} aria-current={i === view.currentPlayerIndex ? 'true' : undefined}>
                            <span className="name" title={p.name}>{p.name}</span>{' '}
                            <span className="tally"><span className="pts"><strong data-testid={`score-${p.id}`}>{p.score}</strong> pt</span> · <span className="count">{p.handCount} tuile{p.handCount > 1 ? 's' : ''}</span></span>
                        </li>
                    ))}
                </ul>
                <p className="bag" data-testid="bag">Réserve : {view.bagCount}</p>
                <button type="button" className="menu-button" disabled={saving} onClick={onMenu}>Menu</button>
            </header>
            {saveAlert}
            {saving && <p role="status">Sauvegarde du tour…</p>}
            <div className="turn">
                {challenge && <><h1>{challenge.title}</h1><p>Tour {view.turnNumber + 1} / {challenge.turnLimit} · Objectif : score ≥ {challenge.targetScore}</p></>}
                <p data-testid="turn">{turnLabel({ name: me?.name, myTurn, aiThinking: ui.aiThinking })}</p>
            </div>
            <div className="board-wrap">
                <Board board={view.board} ghost={ui.ghost} cursor={myTurn ? ui.cursor : null} tiles={tiles} highContrast={highContrast} colourBlind={colourBlind} zoom={zoom}
                    onTap={(x, y) => { dispatch({ t: 'placeAt', x, y }); }} label={`Plateau, ${Object.keys(view.board).length} tuiles posées. ${myTurn ? `Case du curseur ${ui.cursor.x}, ${ui.cursor.y}, ${cursorContent}.` : ''}`} />
                <div className="zoom" role="group" aria-label="Zoom du plateau">
                    <button type="button" aria-label="Zoomer" onClick={() => { dispatch({ t: 'zoom', factor: 1.2 }); }}>+</button>
                    <button type="button" aria-label="Dézoomer" onClick={() => { dispatch({ t: 'zoom', factor: 1 / 1.2 }); }}>−</button>
                </div>
            </div>
            <section className="panel">
                <p className="cursor" data-testid="cursor">Case {ui.cursor.x}, {ui.cursor.y}</p>
                <p className="sr-only" aria-live="polite">{myTurn ? `Case ${ui.cursor.x}, ${ui.cursor.y}, ${cursorContent}` : ''}</p>
                <div className="hand" role="group" aria-label={ui.mode === 'exchange' ? 'Tuiles à échanger' : 'Ta main'} data-testid="hand">
                    {shown.map((t, i) => {
                        const placed = !left.has(t.id);
                        const pressed = ui.mode === 'exchange' ? ui.exchangeSel.includes(t.id) : ui.selected === t.id;
                        return (
                            <button key={t.id} type="button" className={`tile${pressed ? ' selected' : ''}${placed ? ' placed' : ''}`} disabled={!canAct || (placed && ui.mode === 'place')}
                                aria-pressed={pressed} aria-label={`${i + 1} : ${tileLabel(t)}${placed ? ', posée' : ''}`} data-tile={t.id}
                                onClick={() => { dispatch(ui.mode === 'exchange' ? { t: 'toggleExchangeTile', tileId: t.id } : { t: 'select', tileId: t.id }); }}>
                                <TileImage tile={t} highContrast={highContrast} colourBlind={colourBlind} />
                                {/* Numéro visible de la touche 1 à 6 ; le nom accessible le porte déjà (aria-label). */}
                                <span className="key" aria-hidden="true">{i + 1}</span>
                            </button>
                        );
                    })}
                    {shown.length === 0 && <p className="hidden-hand">Main cachée</p>}
                </div>
                <p className="preview" data-testid="preview">
                    {ui.previewError ? <span className="error">{ui.previewError}</span> : ui.preview ? `Coup prévu : ${ui.preview.total} point${ui.preview.total > 1 ? 's' : ''}${ui.preview.finalBonus ? `, dont ${ui.preview.finalBonus} pour finir` : ''}` : ui.mode === 'exchange' ? exchangeLabel(ui.exchangeSel.length) : ' '}
                </p>
                {dead && ui.mode === 'place' && <p className="dead" role="status" data-testid="dead-position">
                    Plus aucune tuile du jeu ne peut être posée. Passe, ou échange les tuiles de ton choix (une, plusieurs ou toutes).
                </p>}
                <div className="controls">
                    {ui.mode === 'place' ? <>
                        <button type="button" className="primary" disabled={!canAct || !ui.preview} onClick={() => { endTurn({ t: 'validate' }); }}>Valider</button>
                        <button type="button" disabled={!canAct || ui.ghost.length === 0} onClick={() => { dispatch({ t: 'undoGhost' }); }}>Retirer</button>
                        <button type="button" disabled={!canAct || ui.ghost.length === 0} onClick={() => { dispatch({ t: 'clearGhost' }); }}>Annuler</button>
                        {canExchange && <button type="button" disabled={saving} onClick={() => { dispatch({ t: 'toggleExchange' }); }}>Échanger</button>}
                        {canPass && <button type="button" disabled={saving} onClick={() => { endTurn({ t: 'pass' }); }}>Passer</button>}
                        {!challenge && <button type="button" disabled={!canAct} onClick={() => { dispatch({ t: 'hint' }); }}>Indice</button>}
                    </> : <>
                        <button type="button" className="primary" disabled={saving || ui.exchangeSel.length === 0} onClick={() => { endTurn({ t: 'confirmExchange' }); }}>Confirmer l’échange</button>
                        <button type="button" disabled={saving} onClick={() => { dispatch({ t: 'toggleExchange' }); }}>Retour à la pose</button>
                    </>}
                </div>
                {!challenge && <>
                    <h2 className="history-title">Derniers coups</h2>
                    <div className="history-scroll" role="region" aria-label="Historique des coups" tabIndex={0}>
                        <ol className="history" data-testid="history" reversed>
                            {history.map(e => <li key={e.seq} value={e.seq + 1}>{describeEvent(e, ui.config, tiles)}</li>)}
                        </ol>
                    </div>
                </>}
            </section>
            <p className="sr-only" aria-live="polite" data-testid="announce">{refused?.ui === ui ? refused.text : announce}</p>
        </main>
    );
}
