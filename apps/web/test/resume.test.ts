import { expect, it } from 'vitest';
import { createGame } from '@six-de-chaque/engine';
import { initialUi } from '../src/game/controller';
import { resumeOffer } from '../src/game/resume';
import { configOf } from '../../../packages/engine/test/play';

it('a finished game is never offered for resumption', () => {
    const config = configOf(2);
    const state = createGame(config, 'reprise');
    const current = initialUi({ state, events: [] }, config, 'partie-1');
    const saved = { id: current.gameId, note: null };
    expect(resumeOffer(null, saved)).toEqual({ source: 'saved', save: saved });
    expect(resumeOffer(current, saved)).toEqual({ source: 'current', ui: current });

    const finished = { ...current, session: { ...current.session, state: { ...state, phase: 'finished' as const } } };
    expect(resumeOffer(finished, saved)).toBeNull();
    expect(resumeOffer(finished, null)).toBeNull();
});
