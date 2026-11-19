import { describe, expect, it } from 'vitest';
import { createGame, submit } from '@six-de-chaque/engine';
import type { AiLevel, GameConfig, Session } from '@six-de-chaque/engine';
import { decideNow } from '../src/policies';
import { nextAction } from '../../engine/test/play';
import { positionOf } from './positions';

const RUNS = Number(process.env.AI_RUNS ?? 10);
const MAX_TURNS = 200;

function configFor(levels: readonly (AiLevel | 'human')[]): GameConfig {
    return { players: levels.map((level, i) => {
        const identity = { id: `p${i}`, name: `Joueur ${i}` };
        return i === 0 || level === 'human' ? { ...identity, type: 'human' } : { ...identity, type: 'ai', aiLevel: level };
    }) };
}

function playAi(seed: string, levels: readonly (AiLevel | 'human')[], budget = 512): Session {
    let session: Session = { state: createGame(configFor(levels), seed), events: [] };
    while (session.state.phase !== 'finished') {
        if (session.state.turnNumber >= MAX_TURNS) throw new Error(`partie ${seed} non terminée après ${MAX_TURNS} coups`);
        const pos = positionOf(session.state);
        const level = levels[session.state.currentPlayerIndex]!;
        const move = level === 'human' ? nextAction(session)
            : decideNow(pos.view, pos.hand, pos.playerId, level, budget, session.state.turnNumber, pos.passLegal).move;
        const next = submit(session, move);
        if (!next.result.ok) throw new Error(`${seed} : ${next.result.error.code}`);
        session = next.session;
    }
    return session;
}

describe('ai games terminate', () => {
    it(`${RUNS} games between computers end under ${MAX_TURNS} turns`, () => {
        const mixes = [['beginner', 'expert'], ['intermediate', 'advanced', 'expert'], ['expert', 'beginner', 'advanced', 'intermediate']] as const;
        let longest = 0;
        for (let i = 0; i < RUNS; i++) {
            const mix = mixes[i % 10] ?? (i % 2 === 0 ? ['beginner', 'intermediate'] : ['intermediate', 'beginner', 'beginner']);
            const s = playAi(`fin-${i}`, mix, 96);
            expect(s.state.phase).toBe('finished');
            expect(s.state.turnNumber).toBeLessThan(MAX_TURNS);
            longest = Math.max(longest, s.state.turnNumber);
        }
        console.info(`terminaison : ${RUNS} parties, plus longue ${longest} coups`);
    }, Math.max(600_000, RUNS * 2_000));

    it('one human against three computers plays to the end', () => {
        const session = playAi('quatre-joueurs', ['human', 'intermediate', 'advanced', 'expert']);
        expect(session.state.phase).toBe('finished');
        expect(session.state.turnNumber).toBeLessThan(MAX_TURNS);
        expect(session.state.players.map(p => [p.type, p.aiLevel])).toEqual([
            ['human', undefined], ['ai', 'intermediate'], ['ai', 'advanced'], ['ai', 'expert']
        ]);
        expect(new Set(session.events.map(e => e.action.actorId))).toEqual(new Set(session.state.players.map(p => p.id)));
        for (const event of session.events) {
            expect(event.actionId.startsWith('ordi-')).toBe(event.action.actorId !== 'p0');
        }
    }, 60_000);

    it('expert beats beginner over 40 seeded games', () => {
        let wins = 0;
        let ties = 0;
        for (let i = 0; i < 40; i++) {
            const seat = i % 2;
            const { state } = playAi(`duel-${Math.floor(i / 2)}`, seat === 0 ? ['expert', 'beginner'] : ['beginner', 'expert']);
            const margin = state.players[seat]!.score - state.players[1 - seat]!.score;
            if (margin > 0) wins++;
            if (margin === 0) ties++;
        }
        console.info(`expert : ${wins}/40 victoires (${wins * 2.5} %), ${ties} égalité(s)`);
        expect(wins / 40).toBeGreaterThan(0.5);
    }, 600_000);
});
