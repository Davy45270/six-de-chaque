import { useMemo, useState } from 'react';
import { applyAction, createGame } from '@six-de-chaque/engine';
import type { GameConfig, GameEvent, GameState } from '@six-de-chaque/engine';
import { Board, ZoomControls } from '../components';
import { describeEvent } from '../game/describe';

/** Rejeu pas à pas, accessible seulement une fois la partie finie. */
export function Replay({ config, seed, events, highContrast, colourBlind, onBack, onExport }: { config: GameConfig; seed: string; events: readonly GameEvent[]; highContrast: boolean; colourBlind: boolean; onBack(): void; onExport(): void }) {
    const states = useMemo(() => {
        const out: GameState[] = [createGame(config, seed)];
        for (const e of events) { const t = applyAction(out[out.length - 1] as GameState, e.action, e.prevHash); if (t.ok) out.push(t.state); else break; }
        return out;
    }, [config, seed, events]);
    const [step, setStep] = useState(states.length - 1);
    const [zoom, setZoom] = useState({ n: 0, factor: 1 });
    const state = states[step] as GameState;
    const event = step > 0 ? events[step - 1] : undefined;
    return (
        <main className="screen replay">
            <h1>Rejeu</h1>
            <p aria-live="polite" data-testid="replay-step">Coup {step} sur {states.length - 1}{event ? ` — ${describeEvent(event, config, state.tilesById)}` : ' — début de la partie'}</p>
            <div className="board-wrap">
                <Board board={state.board} ghost={[]} cursor={null} tiles={state.tilesById} highContrast={highContrast} colourBlind={colourBlind} zoom={zoom} keyboardCamera label={`Plateau au coup ${step}`} />
                <ZoomControls onZoom={factor => { setZoom(z => ({ n: z.n + 1, factor })); }} />
            </div>
            <p className="scores">{state.players.map(p => `${p.name} ${p.score}`).join(' · ')}</p>
            <div className="menu row">
                <button type="button" onClick={() => { setStep(0); }} disabled={step === 0}>Début</button>
                <button type="button" onClick={() => { setStep(s => Math.max(0, s - 1)); }} disabled={step === 0}>Précédent</button>
                <button type="button" onClick={() => { setStep(s => Math.min(states.length - 1, s + 1)); }} disabled={step === states.length - 1}>Suivant</button>
                <button type="button" onClick={() => { setStep(states.length - 1); }} disabled={step === states.length - 1}>Fin</button>
                <button type="button" onClick={onExport}>Exporter la partie</button>
                <button type="button" onClick={onBack}>Retour</button>
            </div>
        </main>
    );
}
