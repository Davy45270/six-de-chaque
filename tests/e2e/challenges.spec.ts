import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { board, myTurn, openApp } from './helpers';
import { tabTo } from './keyboard-nav';

async function startFirstChallenge(page: Page): Promise<void> {
    await openApp(page);
    await page.getByRole('button', { name: 'Défis', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Palier 3' })).toBeVisible();
    await page.getByRole('button', { name: /^Défi 1\.1/ }).click();
    await myTurn(page);
    await expect(page.getByText('Tour 1 / 1 · Objectif : score ≥ 4')).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-tiles', '7');
    await tabTo(page, board(page));
}

test('defi-reussi', async ({ page }) => {
    await startFirstChallenge(page);
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowUp', '2', 'Enter', 'ArrowDown', '2', 'Enter']) await page.keyboard.press(key);
    await expect(page.getByTestId('preview')).toHaveText('Coup prévu : 4 points');
    await page.keyboard.press('v');
    await expect(page.getByRole('heading', { name: 'Défi réussi' })).toBeVisible();
    await expect(page.getByText(/Score : 4 · Objectif/)).toBeVisible();
    await page.getByRole('button', { name: 'Liste des défis' }).click();
    await expect(page.getByRole('button', { name: /Défi 1\.1 · Réussi/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open('six-de-chaque');
        open.onerror = () => { resolve(undefined); };
        open.onsuccess = () => {
            const db = open.result;
            const read = db.transaction('settings').objectStore('settings').get('completedChallenges');
            read.onsuccess = () => { db.close(); resolve(read.result); };
        };
    }))).toEqual(['rivage-1-3']);
    await page.reload();
    await page.getByRole('button', { name: 'Défis', exact: true }).click();
    await expect(page.getByRole('button', { name: /Défi 1\.1 · Réussi/ })).toBeVisible();
});

test('defi-manque', async ({ page }) => {
    await startFirstChallenge(page);
    for (const key of ['ArrowLeft', 'ArrowUp', '3', 'Enter', 'v']) await page.keyboard.press(key);
    await expect(page.getByRole('heading', { name: 'Défi manqué' })).toBeVisible();
    await page.getByRole('button', { name: 'Voir une solution' }).click();
    await expect(page.getByRole('heading', { name: 'Solution du défi' })).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-tiles', '7');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(board(page)).toHaveAttribute('data-tiles', '9');
    await expect(page.getByText('Tour 1 / 1 · Score : 4')).toBeVisible();
    await page.getByRole('button', { name: 'Précédent' }).click();
    await expect(board(page)).toHaveAttribute('data-tiles', '7');
    await page.getByRole('button', { name: 'Retour' }).click();
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('Tour 1 / 1 · Objectif : score ≥ 4')).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-tiles', '7');
});
