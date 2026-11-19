import { test, expect } from '@playwright/test';
import { contrastRatio } from '../../packages/renderer-pixi/src/palette';
import { board, handTiles, myTurn, newGame, openApp } from './helpers';
import { tabTo } from './keyboard-nav';

// Les boutons de la main gardent leur numéro (« 2 : … ») quand une tuile est posée en fantôme : la touche du
// clavier désigne la tuile annoncée sous ce numéro, jamais une tuile renumérotée en silence.
test('after a placement, key 2 selects the tile announced as 2', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await tabTo(page, board(page));
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await expect(handTiles(page).first()).toHaveAccessibleName(/^1 : .*, posée$/);
    await page.keyboard.press('2');
    const pressed = handTiles(page).and(page.locator('[aria-pressed="true"]'));
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveAccessibleName(/^2 : /);
    // La touche d'une tuile déjà posée ne sélectionne rien d'autre.
    await page.keyboard.press('1');
    await expect(pressed).toHaveAccessibleName(/^2 : /);
});

// Le numéro de la touche (1 à 6) se voit sur chaque galet de la main, posé en fantôme compris : texte visible égal
// à N, boîte non vide et opacité effective non nulle, ni masque, ni découpe, ni visibilité cachée sur lui ou un ancêtre, contraste 4,5:1 sur son propre fond, sans chevaucher
// l'initiale daltonienne ni la boîte du glyphe (lues dans le SVG du galet). Trois formats, deux apparences.
test('every hand tile shows its key number', async ({ page }) => {
    for (const highContrast of [false, true]) {
        await openApp(page, 'clavier');
        await page.getByLabel('Mode daltonien').check();
        if (highContrast) await page.getByLabel('Contraste élevé').check();
        await expect(page.locator('html')).toHaveClass(highContrast ? /\bhc\b/ : /^(?!.*\bhc\b)/);
        await newGame(page);
        await myTurn(page);
        await tabTo(page, board(page));
        await page.keyboard.press('1');
        await page.keyboard.press('Enter');
        await expect(board(page)).toHaveAttribute('data-ghost', '1');
        await expect(handTiles(page)).toHaveCount(6);
        for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
            const tiles = await handTiles(page).evaluateAll(buttons => buttons.map(b => {
                const key = b.querySelector('.key');
                const img = b.querySelector('img');
                if (!key || !img) return null;
                let opacity = 1;
                // Ce qui peut effacer le numéro sans toucher à son opacité : masque, découpe, visibilité, contenu
                // escamoté, sur le numéro lui-même ou l'un de ses ancêtres.
                const hiders: string[] = [];
                for (let e: Element | null = key; e; e = e.parentElement) {
                    const st = getComputedStyle(e);
                    opacity *= Number(st.opacity);
                    const tag = e === key ? 'numéro' : `${e.tagName.toLowerCase()}${e.className ? `.${e.className.trim().replace(/\s+/g, '.')}` : ''}`;
                    const css = (name: string): string => st.getPropertyValue(name).trim();
                    for (const name of ['mask-image', '-webkit-mask-image', 'clip-path']) {
                        const v = css(name);
                        if (v && v !== 'none') hiders.push(`${tag} : ${name}=${v}`);
                    }
                    const mask = css('mask');
                    if (mask && !/^none\b/.test(mask)) hiders.push(`${tag} : mask=${mask}`);
                    if (css('visibility') === 'hidden' || css('visibility') === 'collapse') hiders.push(`${tag} : visibility=${css('visibility')}`);
                    if (css('content-visibility') === 'hidden') hiders.push(`${tag} : content-visibility=hidden`);
                }
                const cs = getComputedStyle(key);
                const hex = (s: string): string => `#${(s.match(/[\d.]+/g) ?? []).slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('')}`;
                const alpha = (s: string): number => (s.startsWith('rgba') ? Number(s.match(/[\d.]+/g)?.[3] ?? 1) : 1);
                const svg = decodeURIComponent(img.src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
                const ir = img.getBoundingClientRect();
                const s = Math.min(ir.width, ir.height) / 64;
                const ox = ir.left + (ir.width - 64 * s) / 2, oy = ir.top + (ir.height - 64 * s) / 2;
                const box = (x: number, y: number, w: number, h: number) => ({ left: ox + x * s, top: oy + y * s, right: ox + (x + w) * s, bottom: oy + (y + h) * s });
                const ini = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" fill="[^"]+"\/><text /.exec(svg);
                const tr = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/.exec(svg);
                const kr = key.getBoundingClientRect();
                return {
                    text: (b as HTMLElement).innerText.trim(), keyText: (key as HTMLElement).innerText.trim(),
                    key: { left: kr.left, top: kr.top, right: kr.right, bottom: kr.bottom, width: kr.width, height: kr.height },
                    opacity, hiders, visibility: cs.visibility, display: cs.display, fg: hex(cs.color), bg: hex(cs.backgroundColor), bgAlpha: alpha(cs.backgroundColor),
                    initial: ini ? box(Number(ini[1]), Number(ini[2]), Number(ini[3]), Number(ini[4])) : null,
                    glyph: tr ? box(Number(tr[1]), Number(tr[2]), 24 * Number(tr[3]), 24 * Number(tr[3])) : null,
                    placed: b.classList.contains('placed')
                };
            }));
            const where = `${highContrast ? 'contraste élevé' : 'normal'} ${viewport.width}x${viewport.height}`;
            expect(tiles.some(t => t?.placed), `${where} : un galet posé en fantôme`).toBe(true);
            for (const [i, t] of tiles.entries()) {
                const what = `${where}, galet ${i + 1}`;
                if (!t) throw new Error(`${what} : numéro ou image absents`);
                // 1. Le texte visible de la tuile N vaut N.
                expect(t.text, what).toBe(String(i + 1));
                expect(t.keyText, what).toBe(String(i + 1));
                // 2. Le numéro est visible : boîte non vide, opacité effective non nulle (entière : le galet fantôme seul est grisé).
                expect(t.key.width, what).toBeGreaterThan(0);
                expect(t.key.height, what).toBeGreaterThan(0);
                expect(t.opacity, what).toBe(1);
                expect(t.visibility, what).toBe('visible');
                expect(t.display, what).not.toBe('none');
                expect(t.hiders, `${what} : masque, découpe ou visibilité sur le numéro ou un ancêtre`).toEqual([]);
                expect(t.bgAlpha, `${what} : fond opaque`).toBe(1);
                expect(contrastRatio(t.fg, t.bg), `${what} : ${t.fg} sur ${t.bg}`).toBeGreaterThanOrEqual(4.5);
                // 3. Il ne chevauche ni l'initiale daltonienne ni la boîte du glyphe.
                for (const [name, r] of [['initiale', t.initial], ['glyphe', t.glyph]] as const) {
                    if (!r) throw new Error(`${what} : ${name} introuvable dans le SVG`);
                    const apart = t.key.right <= r.left || r.right <= t.key.left || t.key.bottom <= r.top || r.bottom <= t.key.top;
                    expect(apart, `${what} : numéro ${JSON.stringify(t.key)} sur ${name} ${JSON.stringify(r)}`).toBe(true);
                }
            }
        }
    }
});
