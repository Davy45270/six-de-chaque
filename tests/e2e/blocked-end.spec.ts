import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test('blocked-end', async ({ page }) => {
    await openApp(page, 'bloc');
    await page.getByTestId('import-file').setInputFiles('tests/fixtures/blocked.json');
    await expect(page.locator('.board[data-ready="oui"]')).toBeVisible();
    // L'ordinateur passe, puis le bouton « Passer » est proposé à l'humain, et la partie se termine.
    const passButton = page.getByRole('button', { name: 'Passer' });
    await expect(passButton).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('history')).toContainText('Ordinateur passe.');
    await passButton.click();
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await expect(page.getByText('Plus personne ne pouvait poser')).toBeVisible();
    await expect(page.getByTestId('winner')).toHaveText('Victoire : Toi');
    await page.getByRole('button', { name: 'Revoir la partie' }).click();
    await expect(page.getByTestId('replay-step')).toContainText(' — Tu passes.');
    await page.getByRole('button', { name: 'Début' }).click();
    await expect(page.getByTestId('replay-step')).toContainText('Coup 0');
});
