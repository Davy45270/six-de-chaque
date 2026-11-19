import { test, expect } from '@playwright/test';
import { board } from './helpers';

// Position morte en 390 × 844 : les actions du tour tiennent dans l'écran sans défilement, et les deux boutons
// de zoom restent ensemble (aucune commande isolée sur sa ligne).
test('turn actions stay on screen without scrolling at 390 by 844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?exemple=position-morte');
    await expect(page.getByTestId('turn')).toHaveText(/^À toi/, { timeout: 20_000 });
    await expect(board(page)).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const name of ['Valider', 'Échanger', 'Passer']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.y, `${name} commence sous l'écran`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `${name} dépasse le bas de l'écran (${box!.y + box!.height} > 844)`).toBeLessThanOrEqual(844);
    }
    const plus = await page.getByRole('button', { name: 'Zoomer', exact: true }).boundingBox();
    const minus = await page.getByRole('button', { name: 'Dézoomer', exact: true }).boundingBox();
    expect(plus && minus).toBeTruthy();
    for (const b of [plus!, minus!]) expect(b.y + b.height, 'zoom hors de l’écran').toBeLessThanOrEqual(844);
    // Ensemble : sur la même ligne ou la même colonne, à moins d'un bouton l'un de l'autre.
    const together = Math.abs(plus!.y - minus!.y) < 1 || Math.abs(plus!.x - minus!.x) < 1;
    expect(together, `+ en ${plus!.x},${plus!.y} ; − en ${minus!.x},${minus!.y}`).toBe(true);
    expect(Math.hypot(plus!.x - minus!.x, plus!.y - minus!.y)).toBeLessThan(70);
});
