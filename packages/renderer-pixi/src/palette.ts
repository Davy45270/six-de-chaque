// Couleurs (dérivées d'Okabe-Ito), variantes à contraste élevé, motifs et noms : un motif par couleur, pour que
// la couleur ne soit jamais le seul indice.
export const COLORS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00'] as const;
export const COLORS_HIGH_CONTRAST: typeof COLORS = ['#8A4B00', '#005A8C', '#00664A', '#6B5E00', '#003F7A', '#A33A00'] as unknown as typeof COLORS;
export const PATTERNS = ['plein', 'raye', 'pointille', 'quadrille', 'anneau', 'chevron'] as const;
export const COLOR_NAMES = ['orange', 'ciel', 'vert', 'jaune', 'bleu', 'vermillon'] as const;
export const PATTERN_NAMES = ['plein', 'rayé', 'pointillé', 'quadrillé', 'anneau', 'chevron'] as const;
export const SHAPE_NAMES = ['lune', 'goutte', 'feuille', 'éclair', 'spirale', 'cœur'] as const;
/** Fond du galet et du plateau. */
export const TILE_BG = '#F3E9D2';
export const TILE_BG_HIGH_CONTRAST = '#FFFFFF';
export const BOARD_BG = '#E9DCC0';
export const INK = '#3B2F1E';

/** Nom accessible d'une tuile : « lune orange (plein) ». */
export const tileName = (color: number, shape: number): string =>
    `${SHAPE_NAMES[shape] ?? '?'} ${COLOR_NAMES[color] ?? '?'} (${PATTERN_NAMES[color] ?? '?'})`;

/** Rapport de contraste WCAG entre deux couleurs « #RRGGBB ». */
export function contrastRatio(a: string, b: string): number {
    const lum = (hex: string): number => {
        const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
}
