import { describe, expect, it } from 'vitest';
import { COLORS, COLORS_HIGH_CONTRAST, PATTERNS, SHAPE_NAMES, TILE_BG_HIGH_CONTRAST, contrastRatio, tileName } from '../src/palette';
import { GLYPHS, glyphSheet, tileSvg } from '../src/art';

describe('palette and art', () => {
    it('palette: six distinct colours and six distinct patterns', () => {
        expect(new Set(COLORS).size).toBe(6);
        expect(new Set(COLORS_HIGH_CONTRAST).size).toBe(6);
        expect(new Set(PATTERNS).size).toBe(6);
        expect(new Set(SHAPE_NAMES).size).toBe(6);
    });
    it('high contrast colours reach 4.5:1 against the tile background', () => {
        for (const c of COLORS_HIGH_CONTRAST) expect(contrastRatio(c, TILE_BG_HIGH_CONTRAST)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    });
    it('the six glyphs are the original set, never the commercial shapes', () => {
        expect(GLYPHS.map(g => g.id)).toEqual(['lune', 'goutte', 'feuille', 'eclair', 'spirale', 'coeur']);
        const sheet = glyphSheet();
        for (const id of ['lune', 'goutte', 'feuille', 'eclair', 'spirale', 'coeur']) expect(sheet).toContain(`id="${id}"`);
        expect(sheet).not.toMatch(/<(circle|polygon|rect)\b/);
    });
    it('the SVG shows only the colour initial in colour-blind mode', () => {
        for (const [color, initial] of ['O', 'C', 'V', 'J', 'B', 'R'].entries()) {
            expect(tileSvg(color, 0, { colourBlind: true })).toMatch(new RegExp(`<text [^>]*>${initial}</text>`));
            expect(tileSvg(color, 0, { colourBlind: true, highContrast: true })).toContain(`>${initial}</text>`);
            expect(tileSvg(color, 0)).not.toContain('<text');
        }
    });
    it('colour-blind initials are six distinct letters', () => {
        for (const highContrast of [false, true]) {
            const letters = Array.from({ length: 6 }, (_, c) => /<text [^>]*>([^<]+)<\/text>/.exec(tileSvg(c, 0, { colourBlind: true, highContrast }))?.[1]);
            expect(letters.every(l => l !== undefined && /^[A-Z]$/.test(l))).toBe(true);
            expect(new Set(letters).size).toBe(6);
        }
    });
    it('each colour has its own pattern drawing, whatever the hue', () => {
        // La couleur remplacée par un jeton : seul reste le dessin du motif (plein, rayé, pointillé, quadrillé,
        // anneau, chevron). Deux couleurs au même motif ne se distingueraient plus que par la teinte.
        for (const highContrast of [false, true]) {
            const colours = highContrast ? COLORS_HIGH_CONTRAST : COLORS;
            const drawings = colours.map((hex, c) => tileSvg(c, 0, { highContrast }).split(hex).join('COULEUR'));
            for (const [c, d] of drawings.entries()) expect(d, `couleur ${c}`).toContain('COULEUR');
            expect(new Set(drawings).size).toBe(6);
        }
    });
    it('every tile has a distinct drawing and a name with shape, colour and pattern', () => {
        const all = new Set<string>();
        for (let c = 0; c < 6; c++) for (let s = 0; s < 6; s++) { all.add(tileSvg(c, s)); all.add(tileSvg(c, s, { highContrast: true })); }
        expect(all.size).toBe(72);
        expect(tileName(0, 0)).toBe('lune orange (plein)');
        expect(tileName(5, 5)).toBe('cœur vermillon (chevron)');
        expect(tileName(2, 0)).toBe('lune verte (pointillé)');
        expect(tileName(4, 3)).toBe('éclair bleu (anneau)');
    });
});

describe('public glyph sheet', () => {
    it('apps/web/public/art/glyphs.svg is generated from the art source', async () => {
        const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
        const file = 'apps/web/public/art/glyphs.svg';
        if (process.env.WRITE_ART || !existsSync(file)) writeFileSync(file, glyphSheet());
        expect(readFileSync(file, 'utf8')).toBe(glyphSheet());
    });
});
