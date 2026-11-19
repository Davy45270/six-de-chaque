import { expect, it } from 'vitest';
import { createGame, replay } from '@six-de-chaque/engine';
import data from '../data/exemples.json';
import { currentPlayer, deadChoice } from '../src/game/controller';
import { replayExample } from '../src/game/examples';
import type { ExampleData } from '../src/game/examples';

it('every example replays and opens on its screen', () => {
    const open = (key: string) => {
        const example = replayExample(key, data as ExampleData);
        const { config, session } = example.ui;
        expect(replay(config, session.state.seed, session.events)).toEqual(session.state);
        return example;
    };
    expect(Object.keys(data.examples)).toEqual(['deux-humains', 'position-morte', 'fin', 'fin-main-vide', 'echange']);
    const duo = open('deux-humains');
    expect(duo.screen).toBe('play');
    expect(duo.ui.handoverFor).toBe(currentPlayer(duo.ui)?.id);
    expect(duo.ui.handoverFor).not.toBeNull();

    const dead = open('position-morte');
    expect(dead.screen).toBe('play');
    expect(currentPlayer(dead.ui)?.type).toBe('human');
    expect(deadChoice(dead.ui.session)).toBe(true);

    const blocked = open('fin');
    expect(blocked.screen).toBe('end');
    expect(blocked.ui.session.state.endReason).toBe('blocked');
    const empty = open('fin-main-vide');
    expect(empty.screen).toBe('end');
    expect(empty.ui.session.state.endReason).toBe('out');
    expect(empty.ui.session.events.at(-1)?.finalBonus).toBe(6);

    const exchange = open('echange');
    expect(exchange.screen).toBe('play');
    expect(exchange.ui.mode).toBe('exchange');
    expect(currentPlayer(exchange.ui)?.type).toBe('human');
    expect(createGame(exchange.ui.config, 'clavier').currentPlayerIndex).toBe(0);
});
