import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { board, handTiles, myTurn, openApp } from './helpers';

const serious = async (page: import('@playwright/test').Page): Promise<string[]> => {
    const r = await new AxeBuilder({ page }).analyze();
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
};

test('T23 a full first turn is playable with the keyboard only', async ({ page }) => {
    await openApp(page, 'clavier');
    await page.getByRole('button', { name: 'Nouvelle partie' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Commencer' }).focus();
    await page.keyboard.press('Enter');
    await expect(board(page)).toBeVisible();
    await myTurn(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('cursor')).toHaveText('Case 0, 0');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await page.keyboard.press('Backspace');
    await expect(board(page)).toHaveAttribute('data-ghost', '0');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await page.keyboard.press('v');
    await expect(page.getByTestId('score-j1')).toHaveText('1');
    await expect(page.getByTestId('announce')).toContainText('Toi :');
});

test('T23 axe finds no serious violation on home, setup, play and end', async ({ page }) => {
    await openApp(page, 'essai');
    expect(await serious(page)).toEqual([]);
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    expect(await serious(page)).toEqual([]);
    await page.getByRole('button', { name: 'Commencer' }).click();
    await myTurn(page);
    expect(await serious(page)).toEqual([]);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByTestId('import-file').setInputFiles('tests/fixtures/blocked.json');
    await page.getByRole('button', { name: 'Passer' }).click({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    expect(await serious(page)).toEqual([]);
});

test('T23 every tile exposes colour and shape in its accessible name', async ({ page }) => {
    await openApp(page, 'essai');
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await myTurn(page);
    const names = await handTiles(page).evaluateAll(els => els.map(e => e.getAttribute('aria-label') ?? ''));
    expect(names).toHaveLength(6);
    for (const n of names) expect(n).toMatch(/^\d : (lune|goutte|feuille|éclair|spirale|cœur) (orange|ciel|verte?|jaune|bleue?|vermillon) \((plein|rayé|pointillé|quadrillé|anneau|chevron)\)$/);
});

test('high contrast setting persists', async ({ page }) => {
    await openApp(page, 'essai');
    await page.getByLabel('Contraste élevé').check();
    await expect(page.locator('html')).toHaveClass(/\bhc\b/);
    // Le réglage est écrit dans IndexedDB : attendre l'écriture avant de recharger.
    await expect.poll(() => page.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open('six-de-chaque');
        open.onsuccess = () => { const r = open.result.transaction('settings').objectStore('settings').get('highContrast'); r.onsuccess = () => { resolve(r.result); }; };
    }))).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Contraste élevé')).toBeChecked();
    await expect(page.locator('html')).toHaveClass(/\bhc\b/);
});
