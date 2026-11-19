import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { board, myTurn, openApp } from './helpers';

// Géométrie de l'écran de jeu, au bureau comme sur téléphone : le plateau d'un défi tient dans la hauteur de
// l'écran (cadre et zoom compris), la liste « Derniers coups » ne coupe jamais une ligne, et chaque coup y porte
// son vrai numéro dans la partie, le plus récent en premier.
async function bottomOf(page: Page, selector: string): Promise<{ bottom: number; innerHeight: number }> {
    return page.locator(selector).first().evaluate(el => ({ bottom: Math.round(el.getBoundingClientRect().bottom), innerHeight: window.innerHeight }));
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });

        test('the challenge board fits in the screen height, frame and zoom included', async ({ page }) => {
            await openApp(page);
            await page.getByRole('button', { name: 'Défis', exact: true }).click();
            await page.getByRole('button', { name: /^Défi 1\.1/ }).click();
            await myTurn(page);
            await expect(board(page)).toBeVisible();
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
            const b = await bottomOf(page, '.board');
            console.log(`défi : bas du plateau ${JSON.stringify(b)}`);
            expect(b.bottom, 'le bas du plateau sort de l’écran').toBeLessThanOrEqual(b.innerHeight);
            for (const name of ['Zoomer', 'Dézoomer']) await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
        });

        test('the last moves list never cuts a line', async ({ page }) => {
            await page.goto('./?exemple=position-morte');
            await myTurn(page);
            const list = page.getByTestId('history');
            await expect(list.locator('li')).toHaveCount(12);
            const m = await list.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
            console.log(`derniers coups : ${JSON.stringify(m)}`);
            expect(m.scrollHeight, 'la liste masque une partie de ses lignes').toBeLessThanOrEqual(m.clientHeight + 1);
            if (viewport.width >= 900) {
                // Au bureau, la colonne de droite a la place : la liste entière tient dans l'écran, sans défilement.
                const last = await list.locator('li').last().evaluate(el => ({ bottom: Math.round(el.getBoundingClientRect().bottom), innerHeight: window.innerHeight }));
                expect(last.bottom, 'la dernière ligne sort de l’écran').toBeLessThanOrEqual(last.innerHeight);
            }
        });
    });
}

test('each move in the history shows its real number, most recent first', async ({ page }) => {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    const list = page.getByTestId('history');
    await expect(list).toHaveAttribute('reversed', '');
    // L'exemple s'ouvre après 330 coups : le plus récent est le 330e.
    const numbers = await list.locator('li').evaluateAll(els => els.map(e => (e as HTMLLIElement).value));
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => 330 - i));
});
