import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

// Un réglage coché puis la page rechargée aussitôt : le choix doit survivre, et s'afficher dès le premier rendu
// (pas de case par défaut remplacée plus tard par la valeur relue). Répété pour rendre la course visible.
const ROUNDS = 10;
const HEADING = { name: 'Six de chaque' };

test('a toggled setting survives an immediate reload', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page, 'reglages');
    const html = page.locator('html');
    for (const name of ['Contraste élevé', 'Mode daltonien'] as const) {
        const box = page.getByLabel(name);
        for (let round = 1; round <= ROUNDS; round++) {
            for (const on of [true, false]) {
                await expect(box).toBeChecked({ checked: !on });
                await box.click();
                await expect(box).toBeChecked({ checked: on });
                await page.reload();
                await expect(page.getByRole('heading', HEADING)).toBeVisible();
                // Premier rendu : la case montre déjà le choix fait, sans attendre la relecture de la base.
                expect(await box.isChecked(), `${name}, tour ${round} : case au premier rendu après rechargement (attendu ${on})`).toBe(on);
                await expect(box, `${name}, tour ${round} : case après rechargement`).toBeChecked({ checked: on });
                if (name === 'Contraste élevé') await expect(html).toHaveClass(on ? /\bhc\b/ : /^(?!.*\bhc\b)/);
                else await expect(html).not.toHaveClass(/\bhc\b/);
                // Laisser passer un instant : la relecture tardive de la base ne doit pas écraser le choix.
                await page.waitForTimeout(150);
                expect(await box.isChecked(), `${name}, tour ${round} : case 150 ms après rechargement`).toBe(on);
            }
        }
    }
});
