import { useState } from 'react';
import type { AiLevel, GameConfig } from '@six-de-chaque/engine';

type Kind = 'human' | AiLevel;
const DEFAULT_NAMES = ['Toi', 'Ordinateur', 'Joueur 3', 'Joueur 4'];
export function Setup({ onStart, onBack }: { onStart(config: GameConfig): void; onBack(): void }) {
    const [count, setCount] = useState(2);
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [kinds, setKinds] = useState<Kind[]>(['human', 'intermediate', 'beginner', 'human']);
    const players = Array.from({ length: count }, (_, i) => i);
    const humans = players.filter(i => kinds[i] === 'human').length;
    const start = (): void => {
        onStart({ players: players.map(i => {
            const kind = kinds[i] ?? 'human';
            const name = (names[i] ?? '').trim() || `Joueur ${i + 1}`;
            return kind === 'human' ? { id: `j${i + 1}`, name, type: 'human' } : { id: `j${i + 1}`, name, type: 'ai', aiLevel: kind };
        }) });
    };
    return (
        <main className="screen setup">
            <h1>Nouvelle partie</h1>
            <label className="field">Nombre de joueurs
                <select value={count} onChange={e => { setCount(Number(e.target.value)); }}>
                    {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </label>
            {players.map(i => (
                <fieldset key={i} className="player-row">
                    <legend>Joueur {i + 1}</legend>
                    <label className="field">Nom
                        <input value={names[i] ?? ''} maxLength={20} onChange={e => { setNames(n => n.map((v, j) => (j === i ? e.target.value : v))); }} />
                    </label>
                    <label className="field">Qui joue
                        <select value={kinds[i]} onChange={e => { setKinds(k => k.map((v, j) => (j === i ? e.target.value as Kind : v))); }}>
                            <option value="human">Humain</option>
                            <option value="beginner">Ordinateur débutant</option>
                            <option value="intermediate">Ordinateur intermédiaire</option>
                            <option value="advanced">Ordinateur avancé</option>
                            <option value="expert">Ordinateur expert</option>
                        </select>
                    </label>
                </fieldset>
            ))}
            {humans === 0 && <p className="error" role="alert">Il faut au moins un joueur humain.</p>}
            <div className="menu row">
                <button type="button" onClick={onBack}>Retour</button>
                <button type="button" className="primary" disabled={humans === 0} onClick={start}>Commencer</button>
            </div>
        </main>
    );
}
