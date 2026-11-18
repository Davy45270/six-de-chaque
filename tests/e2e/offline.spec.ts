import { test, expect } from '@playwright/test';
import { board, handTiles, myTurn, newGame, tapCentre } from './helpers';

test('the installed app starts a game offline', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service worker hors ligne vérifié sur Chromium');
    await page.goto('./?seed=hors-ligne');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Six de chaque' })).toBeVisible();
    await newGame(page);
    await expect(board(page)).toBeVisible();
    await myTurn(page);
    await handTiles(page).first().click();
    await tapCentre(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    // L'ordinateur (Worker en précache) répond aussi hors ligne.
    await expect(page.getByTestId('history')).toContainText('Ordinateur', { timeout: 20_000 });
});
