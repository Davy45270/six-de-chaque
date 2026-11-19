import { describe, expect, it } from 'vitest';
import { createGame } from '../src/create';

// Vecteurs de référence écrits en dur : pour une graine donnée, le tirage (mains initiales puis sac, soit les
// 108 tuiles) doit être identique sur toutes les plateformes (Node, navigateurs). Numéros des tuiles « t-NNN ».
// Le même vecteur pour « clavier » est vérifié dans les navigateurs par tests/e2e/draw-order.spec.ts.
const config = { players: [{ id: 'j1', name: 'Toi', type: 'human' as const }, { id: 'j2', name: 'Ordinateur', type: 'ai' as const, aiLevel: 'beginner' as const }] };
const ids = (list: string): string[] => list.split(' ').map(n => `t-${n.padStart(3, '0')}`);
const REFERENCE: Record<string, { hands: [string, string]; bag: string }> = {
    'clavier': {
        hands: ['0 10 43 20 37 1', '29 53 85 57 21 33'],
        bag: '50 99 60 77 23 18 16 54 87 9 72 6 100 83 79 69 15 44 58 64 98 65 96 51 28 46 74 5 97 32 55 39 80 73 71 94 62 105 31 7 40 35 49 67 38 107 78 93 42 63 101 70 26 81 82 14 103 17 19 75 25 12 66 8 36 90 89 48 61 91 104 86 52 47 76 24 102 11 30 34 56 22 88 13 3 4 2 59 92 84 41 27 68 95 106 45'
    },
    'essai': {
        hands: ['86 22 103 98 96 95', '60 27 62 57 59 6'],
        bag: '35 25 61 38 49 88 3 34 40 53 78 94 30 16 63 90 19 51 100 74 56 105 48 44 43 87 9 83 81 84 18 1 13 39 31 37 79 65 76 92 12 8 67 107 0 41 20 45 69 77 52 7 4 24 73 46 89 32 70 72 14 15 11 64 55 101 75 42 102 97 104 29 2 80 91 17 36 71 68 10 23 85 58 5 66 33 47 21 99 50 26 28 106 82 93 54'
    },
    'graine-0': {
        hands: ['7 0 75 89 99 67', '81 27 17 61 19 6'],
        bag: '94 62 31 3 68 86 100 103 2 91 58 59 69 56 105 64 82 52 78 9 55 24 76 28 44 42 98 22 45 16 104 60 101 93 40 74 29 70 13 54 20 88 32 97 57 65 14 33 49 107 18 26 11 80 39 84 41 50 102 106 73 1 36 83 71 47 23 53 72 77 37 96 8 21 5 4 10 30 87 46 85 34 43 51 90 66 38 92 48 15 35 63 95 12 25 79'
    }
};

describe('draw order', () => {
    it('the draw order for a fixed seed matches the reference vector on every platform', () => {
        for (const [seed, ref] of Object.entries(REFERENCE)) {
            const g = createGame(config, seed);
            expect(g.players.map(p => p.hand), seed).toEqual(ref.hands.map(ids));
            expect(g.bag, seed).toEqual(ids(ref.bag));
            expect(new Set([...g.players.flatMap(p => p.hand), ...g.bag]).size, seed).toBe(108);
        }
    });
});
