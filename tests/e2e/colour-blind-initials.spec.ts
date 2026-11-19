import { test, expect } from '@playwright/test';
import { handTiles, myTurn, newGame, openApp } from './helpers';

// En mode daltonien, chaque tuile de la main porte l'initiale de sa couleur. Taille mesurée à l'écran : corps de
// la lettre dans le SVG (unités du viewBox) × taille rendue de l'image / largeur du viewBox. 12 px au moins.
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
    test(`colour-blind initials are at least 12 px at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, 'clavier');
        await page.getByLabel('Mode daltonien').check();
        await expect(page.getByLabel('Mode daltonien')).toBeChecked();
        await page.waitForTimeout(300);
        await newGame(page);
        await myTurn(page);
        await expect(handTiles(page)).toHaveCount(6);
        const sizes = await handTiles(page).locator('img').evaluateAll(imgs => imgs.map(img => {
            const svg = decodeURIComponent((img as HTMLImageElement).src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
            const font = Number(/<text [^>]*font-size="([\d.]+)"/.exec(svg)?.[1] ?? NaN);
            const box = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
            const r = img.getBoundingClientRect();
            const scale = Math.min(r.width / Number(box?.[1] ?? NaN), r.height / Number(box?.[2] ?? NaN));
            return Math.round(font * scale * 100) / 100;
        }));
        console.log(`initiales ${viewport.width}x${viewport.height} : ${sizes.join(', ')} px`);
        for (const px of sizes) expect(px).toBeGreaterThanOrEqual(12);
    });
}
