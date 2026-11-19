import { useMemo, useState } from 'react';
import { projectPublicState } from '@six-de-chaque/engine';
import { validatePuzzle } from '@six-de-chaque/contracts';
import type { Puzzle } from '@six-de-chaque/puzzles';
import campaign from '../../../../packages/puzzles/data/defis.json';
import receipt from '../../../../packages/puzzles/data/defis.recu.json';
import { Board } from '../components';
import { reduceChallenge, referenceSteps, startChallenge } from '../game/challenge';
import type { ChallengeRun } from '../game/challenge';
import type { UiCommand } from '../game/controller';
import { Play } from './Play';

const challenges = campaign.map(raw => {
    const checked = validatePuzzle(raw);
    const row = receipt.find(entry => entry.seed === raw.seed);
    if (!checked.ok || !row) throw new Error(`Défi de campagne invalide : ${raw.seed}`);
    return { puzzle: checked.value, tier: row.tier };
});
const tiers = [...new Set(challenges.map(entry => entry.tier))].sort((a, b) => a - b);

interface Appearance { highContrast: boolean; colourBlind: boolean }
interface ChallengeProps extends Appearance {
    completed: ReadonlySet<string>;
    onComplete(id: string): void;
    onHome(): void;
}
interface Selection { puzzle: Puzzle; title: string; run: ChallengeRun }

export function Challenges({ completed, highContrast, colourBlind, onComplete, onHome }: ChallengeProps) {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [showSolution, setShowSolution] = useState(false);
    const [zoom, setZoom] = useState({ n: 0, factor: 1 });
    const start = (puzzle: Puzzle, title: string): void => {
        setSelection({ puzzle, title, run: startChallenge(puzzle) });
        setShowSolution(false);
        setZoom({ n: 0, factor: 1 });
    };
    const toList = (): void => { setSelection(null); setShowSolution(false); };
    if (!selection) return (
        <main className="screen challenges">
            <h1>Défis</h1>
            {tiers.map(tier => <section key={tier}>
                <h2>Palier {tier}</h2>
                <ul className="challenge-list">
                    {challenges.filter(entry => entry.tier === tier).map(({ puzzle }, index) => {
                        const title = `Défi ${tier}.${index + 1}`;
                        return <li key={puzzle.seed}>
                            <button type="button" onClick={() => { start(puzzle, title); }}>
                                <strong>{title}{completed.has(puzzle.seed) ? ' · Réussi' : ''}</strong>
                                <span>Score ≥ {puzzle.targetScore} · {puzzle.turnLimit} tour{puzzle.turnLimit > 1 ? 's' : ''}</span>
                            </button>
                        </li>;
                    })}
                </ul>
            </section>)}
            <button type="button" onClick={onHome}>Accueil</button>
        </main>
    );

    const { puzzle, title, run } = selection;
    if (showSolution) return <Solution puzzle={puzzle} highContrast={highContrast} colourBlind={colourBlind} onBack={() => { setShowSolution(false); }} />;
    if (run.status !== 'playing') return (
        <main className="screen challenges">
            <h1>{run.status === 'won' ? 'Défi réussi' : 'Défi manqué'}</h1>
            <p>{title} · Score : {run.ui.session.state.players[0]?.score ?? 0} · Objectif : score ≥ {puzzle.targetScore}</p>
            <div className="menu">
                <button type="button" className="primary" onClick={() => { start(puzzle, title); }}>Réessayer</button>
                <button type="button" onClick={() => { setShowSolution(true); }}>Voir une solution</button>
                <button type="button" onClick={toList}>Liste des défis</button>
            </div>
        </main>
    );

    const state = run.ui.session.state;
    const player = state.players[0];
    const dispatch = (command: UiCommand): void => {
        if (command.t === 'zoom') { setZoom(z => ({ n: z.n + 1, factor: command.factor })); return; }
        const next = reduceChallenge(puzzle, run, command);
        setSelection({ ...selection, run: next });
        if (next.status === 'won') onComplete(puzzle.seed);
    };
    return <Play ui={run.ui} view={projectPublicState(state, player?.id ?? null)} viewerHand={player?.hand ?? null}
        highContrast={highContrast} colourBlind={colourBlind} announce={state.turnNumber ? `Score : ${player?.score ?? 0}` : ''}
        zoom={zoom} dispatch={dispatch} onMenu={toList} challenge={{ title, targetScore: puzzle.targetScore, turnLimit: puzzle.turnLimit }} />;
}

function Solution({ puzzle, highContrast, colourBlind, onBack }: Appearance & { puzzle: Puzzle; onBack(): void }) {
    const steps = useMemo(() => referenceSteps(puzzle), [puzzle]);
    const [step, setStep] = useState(0);
    const state = steps[step];
    if (!state) return null;
    return <main className="screen replay">
        <h1>Solution du défi</h1>
        <p aria-live="polite">Tour {step} / {steps.length - 1} · Score : {state.players[0]?.score ?? 0}</p>
        <Board board={state.board} ghost={[]} cursor={null} tiles={state.tilesById}
            highContrast={highContrast} colourBlind={colourBlind} label={`Plateau de la solution après ${step} pose(s)`} />
        <div className="menu row">
            <button type="button" disabled={step === 0} onClick={() => { setStep(step - 1); }}>Précédent</button>
            <button type="button" disabled={step === steps.length - 1} onClick={() => { setStep(step + 1); }}>Suivant</button>
            <button type="button" onClick={onBack}>Retour</button>
        </div>
    </main>;
}
