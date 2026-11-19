import { describe, expect, it } from 'vitest';
import { exchangeLabel, winnerLabel } from '../src/game/labels';

describe('winnerLabel', () => {
  it('reads correctly whatever the name, vowel or not', () => {
    expect(winnerLabel(['Ordinateur'])).toBe('Victoire : Ordinateur');
    expect(winnerLabel(['Élise'])).toBe('Victoire : Élise');
    expect(winnerLabel(['Toi'])).toBe('Victoire : Toi');
    expect(winnerLabel(['  Hugo '])).toBe('Victoire : Hugo');
  });
  it('names every winner of a shared victory', () => {
    expect(winnerLabel(['Anna', 'Ordinateur'])).toBe('Victoire partagée : Anna et Ordinateur');
    expect(winnerLabel(['Anna', 'Bob', 'Ordinateur'])).toBe('Victoire partagée : Anna, Bob et Ordinateur');
  });
  it('never reads « de » before a name', () => {
    for (const n of ['Ordinateur', 'Alice', 'Yann', 'Hélène']) expect(winnerLabel([n])).not.toMatch(/\bde\b/);
  });
});

describe('exchangeLabel', () => {
  it('agrees with the number of chosen tiles', () => {
    expect(exchangeLabel(0)).toBe('Échange : aucune tuile choisie');
    expect(exchangeLabel(1)).toBe('Échange : 1 tuile choisie');
    expect(exchangeLabel(3)).toBe('Échange : 3 tuiles choisies');
    expect(exchangeLabel(6)).toBe('Échange : 6 tuiles choisies');
  });
});
