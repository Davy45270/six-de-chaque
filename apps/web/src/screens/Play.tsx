import { useEffect } from 'react';
import type { GameEvent, PublicGameState, Tile } from '@six-de-chaque/engine';
import { Board, TileImage, tileLabel } from '../components';
import { currentPlayer, handLeft, passLegal } from '../game/controller';
import type { UiCommand, UiState } from '../game/controller';
import { keyToCommand } from '../game/keyboard';
import { describeEvent } from '../game/describe';

export interface PlayProps {
    ui: UiState; view: PublicGameState; viewerHand: string[] | null; highContrast: boolean; announce: string; zoom: { n: number; factor: number };
    dispatch(c: UiCommand): void; onMenu(): void;
}
export function Play({ ui, view, viewerHand, highContrast, announce, zoom, dispatch, onMenu }: PlayProps) {
    const me = currentPlayer(ui);
    const myTurn = me?.type === 'human' && ui.handoverFor === null && !ui.aiThinking && view.phase !== 'finished';
    const tiles = view.tilesById;
    const canPass = myTurn && passLegal(ui.session);
    const canExchange = myTurn && view.phase !== 'opening' && view.bagCount > 0;
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement | null;
            if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
            if (e.key === 'Enter' && target?.tagName === 'BUTTON') return;
            const c = keyToCommand(e.key, ui);
            if (!c) return;
            e.preventDefault();
            dispatch(c);
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
    }, [ui, dispatch]);
    const left = new Set(myTurn ? handLeft(ui) : viewerHand ?? []);
    const history: GameEvent[] = ui.session.events.slice(-12).reverse();
    const shown = (viewerHand ?? []).map(id => tiles[id]).filter((t): t is Tile => t !== undefined);
    return (
        <main className="screen play">
            <header className="status">
                <ul className="players" aria-label="Scores">
                    {view.players.map((p, i) => (
                        <li key={p.id} className={i === view.currentPlayerIndex ? 'current' : ''} aria-current={i === view.currentPlayerIndex ? 'true' : undefined}>
                            <span className="name">{p.name}</span> <strong data-testid={`score-${p.id}`}>{p.score}</strong>
                            <span className="count" aria-label={`${p.handCount} tuiles en main`}>·{p.handCount}</span>
                        </li>
                    ))}
                </ul>
                <p className="bag" data-testid="bag">Réserve : {view.bagCount}</p>
                <button type="button" className="menu-button" onClick={onMenu}>Menu</button>
            </header>
            <p className="turn" data-testid="turn">{ui.aiThinking ? `${me?.name ?? ''} réfléchit…` : myTurn ? `À toi, ${me.name}` : `Au tour de ${me?.name ?? ''}`}</p>
            <Board board={view.board} ghost={ui.ghost} cursor={myTurn ? ui.cursor : null} tiles={tiles} highContrast={highContrast} zoom={zoom}
                onTap={(x, y) => { dispatch({ t: 'placeAt', x, y }); }} label={`Plateau, ${Object.keys(view.board).length} tuiles posées. Case du curseur ${ui.cursor.x}, ${ui.cursor.y}.`} />
            <section className="panel">
                <p className="cursor" data-testid="cursor">Case {ui.cursor.x}, {ui.cursor.y}</p>
                <div className="hand" role="group" aria-label={ui.mode === 'exchange' ? 'Tuiles à échanger' : 'Ta main'} data-testid="hand">
                    {shown.map((t, i) => {
                        const placed = !left.has(t.id);
                        const pressed = ui.mode === 'exchange' ? ui.exchangeSel.includes(t.id) : ui.selected === t.id;
                        return (
                            <button key={t.id} type="button" className={`tile${pressed ? ' selected' : ''}${placed ? ' placed' : ''}`} disabled={!myTurn || (placed && ui.mode === 'place')}
                                aria-pressed={pressed} aria-label={`${i + 1} : ${tileLabel(t)}${placed ? ', posée' : ''}`} data-tile={t.id}
                                onClick={() => { dispatch(ui.mode === 'exchange' ? { t: 'toggleExchangeTile', tileId: t.id } : { t: 'select', tileId: t.id }); }}>
                                <TileImage tile={t} highContrast={highContrast} />
                            </button>
                        );
                    })}
                    {shown.length === 0 && <p className="hidden-hand">Main cachée</p>}
                </div>
                <p className="preview" data-testid="preview">
                    {ui.previewError ? <span className="error">{ui.previewError}</span> : ui.preview ? `Coup prévu : ${ui.preview.total} point${ui.preview.total > 1 ? 's' : ''}` : ui.mode === 'exchange' ? `Échange : ${ui.exchangeSel.length} tuile(s) choisie(s)` : ' '}
                </p>
                <div className="controls">
                    {ui.mode === 'place' ? <>
                        <button type="button" className="primary" disabled={!myTurn || !ui.preview} onClick={() => { dispatch({ t: 'validate' }); }}>Valider</button>
                        <button type="button" disabled={!myTurn || ui.ghost.length === 0} onClick={() => { dispatch({ t: 'undoGhost' }); }}>Retirer</button>
                        <button type="button" disabled={!myTurn || ui.ghost.length === 0} onClick={() => { dispatch({ t: 'clearGhost' }); }}>Annuler</button>
                        {canExchange && <button type="button" onClick={() => { dispatch({ t: 'toggleExchange' }); }}>Échanger</button>}
                        {canPass && <button type="button" onClick={() => { dispatch({ t: 'pass' }); }}>Passer</button>}
                        <button type="button" disabled={!myTurn} onClick={() => { dispatch({ t: 'hint' }); }}>Indice</button>
                    </> : <>
                        <button type="button" className="primary" disabled={ui.exchangeSel.length === 0} onClick={() => { dispatch({ t: 'confirmExchange' }); }}>Confirmer l’échange</button>
                        <button type="button" onClick={() => { dispatch({ t: 'toggleExchange' }); }}>Retour à la pose</button>
                    </>}
                    <button type="button" aria-label="Zoomer" onClick={() => { dispatch({ t: 'zoom', factor: 1.2 }); }}>+</button>
                    <button type="button" aria-label="Dézoomer" onClick={() => { dispatch({ t: 'zoom', factor: 1 / 1.2 }); }}>−</button>
                </div>
                <h2 className="history-title">Derniers coups</h2>
                <ol className="history" data-testid="history">
                    {history.map(e => <li key={e.seq}>{describeEvent(e, ui.config, tiles)}</li>)}
                </ol>
            </section>
            <p className="sr-only" aria-live="polite" data-testid="announce">{announce}</p>
        </main>
    );
}
