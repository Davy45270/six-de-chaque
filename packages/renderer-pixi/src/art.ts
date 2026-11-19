// Art original (CC BY 4.0, David Sevin) : six glyphes dessinés pour le jeu sur une grille 24 × 24, un galet clair
// aux coins très arrondis, un motif de fond par couleur. Décrit une fois, servi au plateau PixiJS et au DOM.
import { COLOR_INITIALS, COLORS, COLORS_HIGH_CONTRAST, INK, TILE_BG, TILE_BG_HIGH_CONTRAST } from './palette';

export interface Glyph { id: string; d: string; stroke?: boolean }
export const GLYPHS: readonly Glyph[] = [
    { id: 'lune', d: 'M14.5 2.5A9.5 9.5 0 1 0 21.5 17A7.5 7.5 0 1 1 14.5 2.5Z' },
    { id: 'goutte', d: 'M12 2.2C9.6 6 5.2 10.6 5.2 15a6.8 6.8 0 0 0 13.6 0C18.8 10.6 14.4 6 12 2.2Z' },
    { id: 'feuille', d: 'M4 20C3.6 11 9 4.2 20.5 3.5C20.8 14.5 14 20.2 4 20ZM5.5 18.5L15 9' },
    { id: 'eclair', d: 'M14 2L5 13.5H11L9.5 22L19 10H13Z' },
    { id: 'spirale', d: 'M12 12a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0a7.5 7.5 0 0 1 15 0', stroke: true },
    { id: 'coeur', d: 'M12 21C12 21 3 14.6 3 8.6A4.6 4.6 0 0 1 12 6.6A4.6 4.6 0 0 1 21 8.6C21 14.6 12 21 12 21Z' }
];

/** Motif de fond du galet, dessiné dans la couleur, en léger. */
function pattern(index: number, color: string): string {
    const p = (body: string, size = 8): string => `<pattern id="m" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${body}</pattern>`;
    switch (index) {
        case 1: return p(`<path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="${color}" stroke-width="2"/>`);
        case 2: return p(`<circle cx="4" cy="4" r="1.6" fill="${color}"/>`);
        case 3: return p(`<path d="M0 0H8M0 0V8" stroke="${color}" stroke-width="1.4" fill="none"/>`);
        case 5: return p(`<path d="M0 6L4 2L8 6" stroke="${color}" stroke-width="1.6" fill="none"/>`);
        default: return '';
    }
}

/** SVG complet d'un galet (64 × 64 unités), rendu à `px` pixels. */
export interface TileAppearance { highContrast?: boolean; colourBlind?: boolean }

export function tileSvg(color: number, shape: number, opts: TileAppearance & { px?: number } = {}): string {
    const c = (opts.highContrast ? COLORS_HIGH_CONTRAST : COLORS)[color] ?? '#000000';
    const bg = opts.highContrast ? TILE_BG_HIGH_CONTRAST : TILE_BG;
    const g: Glyph = GLYPHS[shape] ?? { id: '?', d: '' };
    const px = opts.px ?? 64;
    const defs = pattern(color, c);
    const fillPattern = defs ? `<rect x="3" y="3" width="58" height="58" rx="17.5" fill="url(#m)" opacity="${opts.highContrast ? 0.35 : 0.45}"/>` : '';
    const ring = color === 4 ? `<rect x="8" y="8" width="48" height="48" rx="13" fill="none" stroke="${c}" stroke-width="3" opacity="0.5"/>` : '';
    const solid = color === 0 ? `<rect x="3" y="3" width="58" height="58" rx="17.5" fill="${c}" opacity="0.18"/>` : '';
    // Contour d'encre visible d'au moins 2 unités sur 64 après mise à l'échelle : c'est lui qui porte le contraste
    // des couleurs claires (jaune, ciel, orange) sur le galet crème, dans toutes les apparences.
    const glyph = g.stroke
        ? `<path d="${g.d}" fill="none" stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/><path d="${g.d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`
        : `<path d="${g.d}" fill="${c}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
    const initial = opts.colourBlind ? COLOR_INITIALS[color] : undefined;
    const letter = initial
        ? `<rect x="23" y="43" width="18" height="17" rx="5" fill="${bg}"/><text x="32" y="57" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="${INK}">${initial}</text>`
        : '';
    const transform = initial ? 'translate(15 8) scale(1.42)' : 'translate(13 13) scale(1.583)';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}"><defs>${defs}</defs>`
        + `<rect x="3" y="3" width="58" height="58" rx="18" fill="${bg}" stroke="${opts.highContrast ? INK : '#B9A57E'}" stroke-width="${opts.highContrast ? 3 : 2}"/>`
        + `${solid}${fillPattern}${ring}<g transform="${transform}">${glyph}</g>${letter}</svg>`;
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Planche des six glyphes (fichier public `art/glyphs.svg`), un `<symbol>` par glyphe. */
export function glyphSheet(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n<!-- Six de chaque : glyphes originaux, CC BY 4.0, David Sevin -->\n`
        + GLYPHS.map(g => `<symbol id="${g.id}" viewBox="0 0 24 24"><path d="${g.d}"${g.stroke ? ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"' : ' fill="currentColor"'}/></symbol>`).join('\n')
        + '\n</svg>\n';
}
