import { test, expect } from '@playwright/test';
import { board, handTiles, myTurn, newGame, openApp, tapCentre } from './helpers';

test('T22 start, place, cancel, validate, reload and resume', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', r => requests.push(r.url()));
    const errors = await openApp(page, 'essai');
    await newGame(page);
    await expect(board(page)).toBeVisible();
    await myTurn(page);
    await expect(handTiles(page)).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Passer' })).toHaveCount(0);
    // Placer, annuler, replacer, valider.
    await handTiles(page).first().click();
    await tapCentre(page);
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await expect(page.getByTestId('preview')).toHaveText('Coup prévu : 1 point');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(board(page)).toHaveAttribute('data-ghost', '0');
    await handTiles(page).first().click();
    await tapCentre(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByTestId('score-j1')).toHaveText('1');
    await expect(page.getByTestId('history')).toContainText('Toi :');
    // L'ordinateur joue à son tour (pose ou échange), puis c'est de nouveau à toi.
    await expect(page.getByTestId('history')).toContainText('Ordinateur', { timeout: 20_000 });
    await myTurn(page);
    const tiles = Number(await board(page).getAttribute('data-tiles'));
    expect(tiles).toBeGreaterThanOrEqual(1);
    const scores = await page.getByRole('list', { name: 'Scores' }).textContent();
    await page.reload();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(board(page)).toHaveAttribute('data-tiles', String(tiles));
    await expect(page.getByRole('list', { name: 'Scores' })).toHaveText(scores ?? '');
    await myTurn(page);
    expect(errors).toEqual([]);
    // Aucune requête hors des fichiers de l'application.
    const origin = new URL(page.url()).origin;
    expect(requests.filter(u => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
});

test('resume-after-ghost', async ({ page }) => {
    await openApp(page, 'e2e-1');
    await newGame(page);
    await myTurn(page);
    await handTiles(page).nth(0).click();
    await tapCentre(page);
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await page.reload();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(board(page)).toHaveAttribute('data-tiles', '0');
    await expect(board(page)).toHaveAttribute('data-ghost', '0');
    await expect(handTiles(page)).toHaveCount(6);
    await expect(page.getByTestId('bag')).toHaveText('Réserve : 96');
});
