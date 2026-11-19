import { expect, it } from 'vitest';
import { tileSvg } from '../src/art';

// Un motif par couleur : c'est lui qui distingue les couleurs sans les voir. Le calque du motif (rayé, pointillé,
// quadrillé, chevron), l'aplat léger et l'anneau doivent rester visibles, en apparence normale comme en contraste
// élevé : une opacité nulle effacerait le seul signe non coloré de la couleur.
const opacities = (svg: string, pick: RegExp): number[] => [...svg.matchAll(pick)].map(m => Number(m[1]));

it('every colour pattern is drawn with a non-zero opacity, in normal and high-contrast appearance', () => {
    for (const highContrast of [false, true]) {
        for (const color of [1, 2, 3, 5]) {
            const svg = tileSvg(color, 0, { highContrast });
            expect(svg, `couleur ${color}`).toContain('<pattern id="m"');
            const layer = opacities(svg, /<rect [^>]*fill="url\(#m\)"[^>]*opacity="([\d.]+)"/g);
            expect(layer, `couleur ${color}, contraste ${highContrast}`).toHaveLength(1);
            expect(layer[0], `couleur ${color}, contraste ${highContrast}`).toBeGreaterThanOrEqual(0.2);
        }
        expect(opacities(tileSvg(0, 0, { highContrast }), /<rect [^>]*fill="#[0-9A-Fa-f]{6}" opacity="([\d.]+)"/g)[0]).toBeGreaterThan(0);
        expect(opacities(tileSvg(4, 0, { highContrast }), /<rect [^>]*fill="none" stroke="#[0-9A-Fa-f]{6}"[^>]*opacity="([\d.]+)"/g)[0]).toBeGreaterThan(0);
    }
});
