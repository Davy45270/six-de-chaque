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
    it('every tile has a distinct drawing and a name with shape, colour and pattern', () => {
        const all = new Set<string>();
        for (let c = 0; c < 6; c++) for (let s = 0; s < 6; s++) { all.add(tileSvg(c, s)); all.add(tileSvg(c, s, { highContrast: true })); }
        expect(all.size).toBe(72);
        expect(tileName(0, 0)).toBe('lune orange (plein)');
        expect(tileName(5, 5)).toBe('cœur vermillon (chevron)');
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
