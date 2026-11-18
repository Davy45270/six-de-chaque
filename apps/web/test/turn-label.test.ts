import { describe, expect, it } from 'vitest';
import { turnLabel } from '../src/game/turn-label';

describe('turnLabel', () => {
  it('ne répète pas « toi » quand le joueur garde le nom par défaut', () => {
    expect(turnLabel({ name: 'Toi', myTurn: true, aiThinking: false })).toBe('À toi !');
    expect(turnLabel({ name: ' toi ', myTurn: true, aiThinking: false })).toBe('À toi !');
  });
  it('nomme le joueur dont c’est le tour quand il a un autre nom', () => {
    expect(turnLabel({ name: 'Léa', myTurn: true, aiThinking: false })).toBe('À toi, Léa');
  });
  it('annonce l’ordinateur qui réfléchit et le tour des autres', () => {
    expect(turnLabel({ name: 'Ordinateur', myTurn: false, aiThinking: true })).toBe('Ordinateur réfléchit…');
    expect(turnLabel({ name: 'Joueur 3', myTurn: false, aiThinking: false })).toBe('Au tour de Joueur 3');
    expect(turnLabel({ name: undefined, myTurn: false, aiThinking: false })).toBe('Au tour de ');
  });
});
