import { test, expect } from '@playwright/test';
import { handTiles, newGame, openApp, tapCentre } from './helpers';

test('hotseat-hides-hand', async ({ page }) => {
    await openApp(page, 'essai');
    await newGame(page, ['human', 'human']);
    const pass = page.getByRole('heading', { name: /^Passe l’appareil à / });
    await expect(pass).toBeVisible();
    await expect(page.locator('[data-tile]')).toHaveCount(0);
    const first = (await pass.textContent())?.replace('Passe l’appareil à ', '') ?? '';
    await page.getByRole('button', { name: `C’est moi, ${first}` }).click();
    await expect(handTiles(page)).toHaveCount(6);
    await handTiles(page).first().click();
    await tapCentre(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(pass).toBeVisible();
    await expect(pass).not.toHaveText(`Passe l’appareil à ${first}`);
    await expect(page.locator('[data-tile]')).toHaveCount(0);
    await page.getByRole('button', { name: /^C’est moi/ }).click();
    await expect(handTiles(page)).toHaveCount(6);
    await expect(page.getByTestId('history')).not.toContainText('t-');
});
