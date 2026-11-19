import { expect, test } from '@playwright/test';
import { board, handTiles, myTurn, newGame, openApp } from './helpers';

test('every example replays and opens on its screen', async ({ page }) => {
    await page.goto('./?exemple=deux-humains');
    await expect(page.getByRole('heading', { name: /^Passe l’appareil/ })).toBeVisible();
    await expect(page.getByTestId('hand')).toHaveCount(0);

    await page.goto('./?exemple=position-morte');
    await expect(page.getByTestId('dead-position')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Échanger' })).toBeVisible();

    await page.goto('./?exemple=fin');
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await expect(page.getByText(/sans bonus/)).toBeVisible();

    await page.goto('./?exemple=fin-main-vide');
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await expect(page.getByText(/\+6 points/)).toBeVisible();

    await page.goto('./?exemple=echange');
    await myTurn(page);
    await expect(page.getByRole('group', { name: 'Tuiles à échanger' })).toBeVisible();
});

test('replay is only reachable once the game is over', async ({ page }) => {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    const replay = page.getByRole('button', { name: 'Revoir la partie' });
    await expect(replay).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(replay).toHaveCount(0);
    await page.goto('./?exemple=position-morte');
    await page.getByRole('button', { name: 'Passer' }).click();
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await replay.click();
    await expect(page.getByRole('heading', { name: 'Rejeu' })).toBeVisible();
});

test('examples leave the saved game available to resume', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    const ids = await handTiles(page).evaluateAll(tiles => tiles.map(tile => tile.getAttribute('data-tile')));
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Reprendre la partie' })).toBeVisible();
    await page.goto('./?exemple=position-morte');
    await page.getByRole('button', { name: 'Passer' }).click();
    await page.getByRole('button', { name: 'Accueil' }).click();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(board(page)).toHaveAttribute('data-tiles', '0');
    expect(await handTiles(page).evaluateAll(tiles => tiles.map(tile => tile.getAttribute('data-tile')))).toEqual(ids);
});
