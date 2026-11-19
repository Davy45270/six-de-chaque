import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COLORS, COLORS_HIGH_CONTRAST, INK, TILE_BG, TILE_BG_HIGH_CONTRAST, contrastRatio } from '../../packages/renderer-pixi/src/palette';
import { tileSvg } from '../../packages/renderer-pixi/src/art';
import { cellToScreen, fitBoard } from '../../packages/renderer-pixi/src/camera';
import { handTiles, newGame, tapCentre } from './helpers';

// Contrastes mesurés sur les couleurs effectives : getComputedStyle de chaque texte et contrôle visible, fonds et
// opacités des ancêtres composés ; glyphes lus dans le SVG des galets (DOM et source du rendu).
// Texte : 4,5:1, état désactivé compris. Glyphe : 3:1, par son remplissage ou par un contour sombre assez épais.

/** Épaisseur minimale d'un contour qui porte seul le contraste du glyphe : 2 unités sur 64, soit 1,4 px sur un galet de 44 px. */
const MIN_OUTLINE = 2;

type Low = { what: string; ratio: number };

/** Couleurs effectives (texte et fond) de chaque texte et contrôle visible de la page. */
async function textContrasts(page: Page): Promise<{ what: string; fg: string; bg: string }[]> {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => {
        type C = [number, number, number, number];
        const parse = (s: string): C => {
            const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
            return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, s.startsWith('rgba') ? m[3] ?? 1 : 1];
        };
        const over = (top: C, under: C, alpha = top[3]): C => [0, 1, 2].map(i => top[i]! * alpha + under[i]! * (1 - alpha)).concat(1) as C;
        const hex = (c: C): string => `#${c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
        // Peint la pile d'ancêtres (fonds, opacités de groupe), puis éventuellement le texte, au-dessus du canevas blanc.
        const paint = (chain: Element[], text: C | null): C => {
            const step = (i: number, under: C): C => {
                const el = chain[i]!;
                const cs = getComputedStyle(el);
                let c = under;
                const bg = parse(cs.backgroundColor);
                if (bg[3] > 0) c = over(bg, c);
                c = i === chain.length - 1 ? (text ? over(text, c) : c) : step(i + 1, c);
                const o = Number(cs.opacity);
                return o < 1 ? over([...c.slice(0, 3), 1] as C, under, o) : c;
            };
            return step(0, [255, 255, 255, 1]);
        };
        const visible = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 1 && r.height > 1 && cs.visibility === 'visible' && !el.closest('.sr-only, [hidden]');
        };
        const out: { what: string; fg: string; bg: string }[] = [];
        for (const el of document.querySelectorAll('body *')) {
            const own = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
            const control = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), select');
            if ((!own && !control) || el.tagName === 'OPTION' || !visible(el)) continue;
            const chain: Element[] = [];
            for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
            const fg = parse(getComputedStyle(el).color);
            const label = el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label') || el.tagName;
            const cls = el.getAttribute('class');
            const state = el.closest('button:disabled') ? ' (désactivé)' : '';
            out.push({ what: `${el.tagName.toLowerCase()}${cls ? `.${cls.split(' ').join('.')}` : ''} « ${label} »${state}`, fg: hex(paint(chain, fg)), bg: hex(paint(chain, null)) });
        }
        return out;
    });
}

async function lowTexts(page: Page, screen: string): Promise<Low[]> {
    const all = await textContrasts(page);
    expect(all.length, `${screen} : aucun texte mesuré`).toBeGreaterThan(0);
    return all.map(t => ({ what: `${screen} : ${t.what} ${t.fg}/${t.bg}`, ratio: contrastRatio(t.fg, t.bg) })).filter(t => t.ratio < 4.5);
}

/** Contraste d'un glyphe dans le SVG d'un galet : le meilleur de son remplissage ou de son contour sombre (s'il est assez épais), sur le pire fond. */
function glyphContrast(svg: string): { ratio: number; detail: string } {
    const bg = /<rect x="3" y="3" width="58" height="58" rx="18" fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1] ?? '#FFFFFF';
    const group = /<g transform="translate\([^)]*\) scale\(([\d.]+)\)">(.*?)<\/g>/.exec(svg);
    const scale = Number(group?.[1] ?? 1);
    const paths = [...(group?.[2] ?? '').matchAll(/<path [^>]*?\/>/g)].map(m => m[0]);
    const attr = (p: string | undefined, a: string): string | undefined => p ? new RegExp(`${a}="([^"]+)"`).exec(p)?.[1] : undefined;
    let fill: string, outline: string, width: number;
    if (paths.length === 2) {
        // Glyphe au trait : un trait sombre large sous un trait coloré plus fin ; le contour visible est la différence.
        fill = attr(paths[1], 'stroke') ?? '#000000';
        outline = attr(paths[0], 'stroke') ?? '#000000';
        width = (Number(attr(paths[0], 'stroke-width')) - Number(attr(paths[1], 'stroke-width'))) / 2 * scale;
    } else {
        fill = attr(paths[0], 'fill') ?? '#000000';
        outline = attr(paths[0], 'stroke') ?? fill;
        width = Number(attr(paths[0], 'stroke-width') ?? 0) * scale;
    }
    // Pire fond sous le glyphe : le galet nu, ou le galet sous le motif de sa couleur (opacité la plus forte du SVG).
    const backs = [bg];
    for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"[^>]*?opacity="([\d.]+)"/g)) backs.push(mix(m[1]!, Number(m[2]), bg));
    for (const m of svg.matchAll(/fill="url\(#m\)" opacity="([\d.]+)"/g)) backs.push(mix(fill, Number(m[1]), bg));
    const worst = (c: string): number => Math.min(...backs.map(b => contrastRatio(c, b)));
    const byFill = worst(fill);
    const byOutline = width >= MIN_OUTLINE ? worst(outline) : 0;
    return { ratio: Math.max(byFill, byOutline), detail: `remplissage ${fill} ${byFill.toFixed(2)}:1, contour ${outline} ${width.toFixed(2)} u ${worst(outline).toFixed(2)}:1, fond ${bg}` };
}
function mix(top: string, alpha: number, under: string): string {
    const ch = (h: string, i: number): number => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
    return `#${[0, 1, 2].map(i => Math.round(ch(top, i) * alpha + ch(under, i) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

async function domGlyphs(page: Page, mode: string): Promise<Low[]> {
    const srcs = await page.locator('img.tile-img').evaluateAll(els => els.map(e => e.getAttribute('src') ?? ''));
    expect(srcs.length, `${mode} : aucun galet affiché`).toBeGreaterThan(0);
    return srcs.map(s => decodeURIComponent(s.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')))
        .map(svg => ({ svg, c: glyphContrast(svg) })).filter(g => g.c.ratio < 3).map(g => ({ what: `galet affiché (${mode}) : ${g.c.detail}`, ratio: g.c.ratio }));
}

const report = (lows: Low[]): string => lows.map(l => `${l.ratio.toFixed(2)}:1 ${l.what}`).join('\n');

async function setAppearance(page: Page, highContrast: boolean, colourBlind: boolean): Promise<void> {
    await page.goto('./?seed=contraste');
    for (const [name, on] of [['Contraste élevé', highContrast], ['Mode daltonien', colourBlind]] as const) {
        const box = page.getByLabel(name);
        if ((await box.isChecked()) !== on) await box.click();
        await expect(box).toBeChecked({ checked: on });
    }
    // Le réglage est écrit dans IndexedDB sans attente visible : laisser l'écriture finir avant de changer de page.
    await page.waitForTimeout(300);
}

test('contrast: every text and enabled control reaches 4.5:1, glyphs 3:1', async ({ page }) => {
    test.setTimeout(120_000);
    const lows: Low[] = [];
    // Glyphes : les 36 galets de la source du rendu, dans les quatre apparences.
    const ink = { normal: [COLORS, TILE_BG], hc: [COLORS_HIGH_CONTRAST, TILE_BG_HIGH_CONTRAST] } as const;
    expect(contrastRatio(INK, ink.normal[1])).toBeGreaterThanOrEqual(4.5);
    for (const highContrast of [false, true]) for (const colourBlind of [false, true]) for (let c = 0; c < 6; c++) for (let s = 0; s < 6; s++) {
        const g = glyphContrast(tileSvg(c, s, { highContrast, colourBlind }));
        if (g.ratio < 3) lows.push({ what: `glyphe ${c}:${s}${highContrast ? ' contraste élevé' : ''}${colourBlind ? ' daltonien' : ''} : ${g.detail}`, ratio: g.ratio });
    }
    // Textes : accueil, configuration, partie (dont « Valider » désactivé), fin ; en apparence normale puis contrastée.
    for (const highContrast of [false, true]) {
        await setAppearance(page, highContrast, false);
        await expect(page.locator('html')).toHaveClass(highContrast ? /\bhc\b/ : /^(?!.*\bhc\b)/);
        const tag = highContrast ? ' (contraste élevé)' : '';
        lows.push(...await lowTexts(page, `accueil${tag}`));
        await page.getByRole('button', { name: 'Nouvelle partie' }).click();
        await page.getByLabel('Nombre de joueurs').selectOption('4');
        lows.push(...await lowTexts(page, `configuration${tag}`));
        await page.goto('./?exemple=position-morte');
        await expect(page.getByTestId('turn')).toHaveText(/^À toi/, { timeout: 20_000 });
        await expect(page.locator('html')).toHaveClass(highContrast ? /\bhc\b/ : /^(?!.*\bhc\b)/);
        await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled();
        lows.push(...await lowTexts(page, `partie${tag}`));
        lows.push(...await domGlyphs(page, `partie${tag}`));
        await page.goto('./?exemple=fin');
        await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
        lows.push(...await lowTexts(page, `fin${tag}`));
    }
    await setAppearance(page, false, true);
    await page.goto('./?exemple=position-morte');
    await expect(page.getByTestId('turn')).toHaveText(/^À toi/, { timeout: 20_000 });
    await expect(page.locator('img.tile-img').first()).toHaveAttribute('src', /%3Ctext/);
    lows.push(...await domGlyphs(page, 'partie daltonien'));
    expect(lows, report(lows)).toEqual([]);
});

test('every interactive target is at least 44 by 44 px', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const small: string[] = [];
    const measure = async (screen: string): Promise<void> => {
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const found = await page.evaluate(() => {
            const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [role=button]';
            const out: { what: string; w: number; h: number }[] = [];
            for (const el of document.querySelectorAll(sel)) {
                // Case à cocher dans son libellé : la cible est le libellé entier.
                const target = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') ?? el : el;
                const r = target.getBoundingClientRect();
                const cs = getComputedStyle(el);
                if (r.width === 0 || r.height === 0 || cs.visibility !== 'visible' || el.closest('[hidden]')) continue;
                // Hors de la page (crochet d'accessibilité tactile de PixiJS, posé à -1000 px) : personne ne peut le toucher.
                if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0) continue;
                out.push({ what: `${el.tagName.toLowerCase()} « ${el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label') || ''} »`, w: r.width, h: r.height });
            }
            return out;
        });
        expect(found.length, `${screen} : aucune cible`).toBeGreaterThan(0);
        for (const f of found) if (f.w < 44 - 0.01 || f.h < 44 - 0.01) small.push(`${screen} : ${f.what} ${f.w.toFixed(1)} × ${f.h.toFixed(1)} px`);
    };
    await page.goto('./?seed=cibles');
    await expect(page.getByRole('heading', { name: 'Six de chaque' })).toBeVisible();
    await measure('accueil');
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByLabel('Nombre de joueurs').selectOption('4');
    await measure('configuration');
    await page.goto('./?exemple=position-morte');
    await expect(page.getByTestId('turn')).toHaveText(/^À toi/, { timeout: 20_000 });
    await measure('partie');
    await page.goto('./?exemple=fin');
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await measure('fin');
    expect(small, small.join('\n')).toEqual([]);
});

/** Côté d'une case du plateau en pixels de monde (`CELL_PX` de board-view.ts, non importé : il charge PixiJS). */
const CELL_PX = 64;

interface Probe { what: string; x0: number; y0: number; x1: number; y1: number }

/**
 * Lit les pixels d'une capture PNG dans la page (canvas 2D) : pour chaque fenêtre (pixels de la capture), la couleur
 * de son pixel le plus sombre (luminance relative WCAG), en « #RRGGBB ».
 */
async function darkestPixels(page: Page, png: Buffer, probes: Probe[]): Promise<string[]> {
    return page.evaluate(async ({ b64, probes }) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas 2D');
        ctx.drawImage(bitmap, 0, 0);
        const lin = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        return probes.map(p => {
            const x0 = Math.max(0, Math.floor(p.x0)), y0 = Math.max(0, Math.floor(p.y0));
            const x1 = Math.min(bitmap.width - 1, Math.ceil(p.x1)), y1 = Math.min(bitmap.height - 1, Math.ceil(p.y1));
            const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
            let best = '#ffffff', lum = Infinity;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
                const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
                if (l < lum) { lum = l; best = hex(r, g, b); }
            }
            return best;
        });
    }, { b64: png.toString('base64'), probes });
}

// Le canevas du plateau en contraste élevé, lu pixel par pixel sur une capture : points de grille, contour du
// curseur, intérieur (glyphe) et contour d'une tuile fantôme, chacun à 3:1 au moins contre le fond du plateau.
// Positions tirées de board-view.ts : plateau vide, fantôme en (0, 0), caméra cadrée par fitBoard sur le fantôme,
// d'où le centre de la case (0, 0) au centre du canevas ; curseur déplacé en (1, 0) d'une touche, case vide.
test('in high contrast the board canvas pixels show the grid, cursor and ghost at 3:1 or more', async ({ page }) => {
    test.setTimeout(90_000);
    await setAppearance(page, true, false);
    await expect(page.locator('html')).toHaveClass(/\bhc\b/);
    // Deux humains : le plateau est vide au premier tour, quel que soit le premier joueur.
    await newGame(page, ['human', 'human']);
    await page.getByRole('button', { name: /^C’est moi/ }).click();
    const b = page.locator('.board[data-ready="oui"]');
    await expect(b).toHaveAttribute('data-tiles', '0');
    await handTiles(page).first().click();
    await tapCentre(page);
    await expect(b).toHaveAttribute('data-ghost', '1');
    await expect(b).toHaveAttribute('data-cursor', '0:0');
    const canvas = b.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canevas absent');
    const camera = fitBoard({}, box.width, box.height, CELL_PX, [{ x: 0, y: 0 }]);
    const s = CELL_PX * camera.zoom;
    const at = (x: number, y: number): { px: number; py: number } => cellToScreen(camera, x, y, CELL_PX);
    // Sans tuile choisie, toucher une case vide y déplace le curseur sans rien poser.
    const right = at(1.5, 0.5);
    await canvas.click({ position: { x: right.px, y: right.py } });
    await expect(b).toHaveAttribute('data-cursor', '1:0');
    await expect(b).toHaveAttribute('data-ghost', '1');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(200);

    const png = await canvas.screenshot({ animations: 'disabled' });
    const width = png.readUInt32BE(16);
    const k = width / box.width;   // pixels de capture par pixel CSS
    // Une fenêtre en pixels CSS, convertie en pixels de capture.
    const win = (what: string, cx: number, cy: number, rx: number, ry: number): Probe =>
        ({ what, x0: (cx - rx) * k, y0: (cy - ry) * k, x1: (cx + rx) * k, y1: (cy + ry) * k });

    const ghost = at(0, 0), cursor = at(1, 0), dot = at(-1 + 0.5, 0 + 0.5), empty = at(-2, -1);
    const cursorWidth = Math.max(3, s * 0.08), ghostWidth = Math.max(2, s * 0.075);
    const probes: Probe[] = [
        // Fond : un petit carré au quart d'une case vide, loin de son point de grille (au centre de la case).
        win('fond', empty.px + s * 0.2, empty.py + s * 0.2, 0.5, 0.5),
        // Point de grille de la case vide (-1, 0) : disque de rayon max(1, 0,03 s) en son centre.
        win('point de grille', dot.px, dot.py, 1, 1),
        // Curseur en (1, 0) : bord haut de roundRect(px + 1, py + 1, s - 2, s - 2), au milieu, sur un quart de trait.
        win('contour du curseur', cursor.px + s / 2, cursor.py + 1, 1, cursorWidth / 4),
        // Fantôme en (0, 0) : bord gauche de roundRect(px + 0,13 s, …, 0,74 s), à mi-hauteur, sur un quart de trait.
        win('contour du fantôme', ghost.px + s * 0.13, ghost.py + s / 2, ghostWidth / 4, 1),
        // Intérieur du fantôme : le glyphe, au centre du galet.
        win('intérieur du fantôme', ghost.px + s / 2, ghost.py + s / 2, s * 0.2, s * 0.2)
    ];
    const [background, ...marks] = await darkestPixels(page, png, probes);
    if (!background) throw new Error('fond non lu');
    // Le fond lu est bien celui du plateau en contraste élevé (blanc), pas un élément peint.
    expect(contrastRatio(background, '#FFFFFF'), `fond lu ${background}`).toBeLessThan(1.1);
    const lows = marks.map((colour, i) => ({ what: `${probes[i + 1]?.what ?? '?'} ${colour} sur ${background}`, ratio: contrastRatio(colour, background) }))
        .filter(m => m.ratio < 3);
    expect(lows, report(lows)).toEqual([]);
});
