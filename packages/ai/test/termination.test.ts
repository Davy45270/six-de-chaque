// Terminaison : des parties entières jouées par l'ordinateur (débutant et intermédiaire) se terminent toutes,
// et sous un plafond de coups. En position morte, l'ordinateur passe : aucun échange ne peut y rendre une tuile
// posable, puisque la réserve n'en contient aucune. La fin par un tour complet de passes reste donc atteinte.
import { describe, expect, it } from 'vitest';
import { createGame, submit } from '@six-de-chaque/engine';
import type { AiLevel, Session } from '@six-de-chaque/engine';
import { decideNow } from '../src/policies';
import { configOf } from '../../engine/test/play';
import { positionOf } from './positions';

const RUNS = Number(process.env.AI_RUNS ?? 10);
/** Plafond : trois fois la plus longue partie mesurée (66 coups sur 60 parties le 2026-11-18). */
export const MAX_TURNS = 200;

function playAi(players: number, seed: string, levels: readonly AiLevel[]): Session {
    let session: Session = { state: createGame(configOf(players), seed), events: [] };
    while (session.state.phase !== 'finished') {
        if (session.state.turnNumber >= MAX_TURNS) throw new Error(`partie ${seed} non terminée après ${MAX_TURNS} coups`);
        const pos = positionOf(session.state);
        const level = levels[session.state.currentPlayerIndex % levels.length] ?? 'beginner';
        const d = decideNow(pos.view, pos.hand, pos.playerId, level, 2_000, session.state.turnNumber, pos.passLegal);
        const next = submit(session, d.action);
        if (!next.result.ok) throw new Error(`${seed} : ${next.result.error.code}`);
        session = next.session;
    }
    return session;
}

describe('ai games terminate', () => {
    it(`${RUNS} games between computers end under ${MAX_TURNS} turns`, () => {
        let longest = 0;
        for (let i = 0; i < RUNS; i++) {
            const levels: AiLevel[] = i % 3 === 0 ? ['beginner'] : i % 3 === 1 ? ['intermediate'] : ['beginner', 'intermediate'];
            const s = playAi(2 + (i % 3), `fin-${i}`, levels);
            expect(s.state.phase).toBe('finished');
            longest = Math.max(longest, s.state.turnNumber);
        }
        console.info(`terminaison : ${RUNS} parties, plus longue ${longest} coups`);
    }, 600_000);
});
