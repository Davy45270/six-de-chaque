import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { board, handTiles, myTurn, newGame, openApp } from './helpers';
import { tabTo } from './keyboard-nav';

const serious = async (page: import('@playwright/test').Page): Promise<string[]> => {
    const r = await new AxeBuilder({ page }).analyze();
    return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
};

test('T23 two full turns with the keyboard only, without forcing focus', async ({ page }) => {
    await openApp(page, 'clavier');
    await tabTo(page, page.getByRole('button', { name: 'Nouvelle partie' }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('button', { name: 'Commencer' }));
    await page.keyboard.press('Enter');
    await expect(board(page)).toBeVisible();
    await myTurn(page);
    await tabTo(page, board(page));
    await expect(board(page)).toHaveAccessibleName(/Case du curseur 0, 0, vide/);
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
    await expect(page.getByTestId('history')).toContainText('Ordinateur');
    await myTurn(page);
    await expect(board(page)).toHaveAccessibleName(/Case du curseur 0, 0, lune orange \(plein\)/);
    await expect(board(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview')).toHaveText('Coup prévu : 2 points');
    await page.keyboard.press('v');
    await expect(page.getByTestId('score-j1')).toHaveText('3');
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


test('colour-blind setting persists', async ({ page }) => {
    await openApp(page, 'clavier');
    await page.getByLabel('Mode daltonien').check();
    await expect.poll(() => page.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open('six-de-chaque');
        open.onerror = () => { resolve(undefined); };
        open.onsuccess = () => {
            const db = open.result;
            const read = db.transaction('settings').objectStore('settings').get('colourBlind');
            read.onsuccess = () => { db.close(); resolve(read.result); };
        };
    }))).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Mode daltonien')).toBeChecked();
    await newGame(page);
    await myTurn(page);
    const tile = handTiles(page).first();
    const label = await tile.getAttribute('aria-label');
    const svg = await tile.locator('img').getAttribute('src');
    expect(decodeURIComponent(svg ?? '')).toMatch(/<text [^>]*>[OCVJB]<\/text>/);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByLabel('Mode daltonien').uncheck();
    await page.getByRole('button', { name: 'Reprendre la partie' }).click();
    await expect(tile).toHaveAttribute('aria-label', label ?? '');
    const plainSvg = await tile.locator('img').getAttribute('src');
    expect(decodeURIComponent(plainSvg ?? '')).not.toContain('<text');
});


test('setup offers advanced and expert computer levels', async ({ page }) => {
    await openApp(page, 'clavier');
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    const kind = page.getByRole('group', { name: 'Joueur 2' }).getByLabel('Qui joue');
    await expect(kind.locator('option')).toHaveText([
        'Humain', 'Ordinateur débutant', 'Ordinateur intermédiaire', 'Ordinateur avancé', 'Ordinateur expert'
    ]);
    await kind.selectOption({ label: 'Ordinateur expert' });
    await page.getByRole('button', { name: 'Commencer' }).click();
    await myTurn(page);
});
