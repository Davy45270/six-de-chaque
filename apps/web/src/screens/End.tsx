import { winners } from '@six-de-chaque/engine';
import type { GameConfig, GameState } from '@six-de-chaque/engine';
import { winnerLabel } from '../game/labels';

export function End({ state, config, onReplay, onExport, onNew, onHome }: { state: GameState; config: GameConfig; onReplay(): void; onExport(): void; onNew(): void; onHome(): void }) {
    const top = winners(state);
    const names = top.map(id => config.players.find(p => p.id === id)?.name ?? id);
    const ranking = [...state.players].sort((a, b) => b.score - a.score);
    return (
        <main className="screen end">
            <h1>Partie terminée</h1>
            <p className="reason">{state.endReason === 'out' ? 'Une main a été vidée alors que la réserve était vide : +6 points.' : 'Plus personne ne pouvait poser : la partie s’arrête, sans bonus.'}</p>
            <p className="winner" data-testid="winner">{winnerLabel(names)}</p>
            <ol className="ranking">
                {ranking.map(p => <li key={p.id}><span>{p.name}</span> <strong>{p.score}</strong> point{p.score > 1 ? 's' : ''}</li>)}
            </ol>
            <div className="menu">
                <button type="button" className="primary" onClick={onReplay}>Revoir la partie</button>
                <button type="button" onClick={onExport}>Exporter la partie</button>
                <button type="button" onClick={onNew}>Nouvelle partie</button>
                <button type="button" onClick={onHome}>Accueil</button>
            </div>
        </main>
    );
}
