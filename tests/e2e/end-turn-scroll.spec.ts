import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { board, handTiles, myTurn, newGame, openApp, tapCentre } from './helpers';

// Toute commande qui termine le tour (Valider, Passer, Confirmer l'échange), au bouton comme au clavier, ramène le
// haut de la partie à l'écran et le focus au plateau. Écran bas : le joueur doit faire défiler la page pour aller
// chercher le bouton ; chaque test vérifie que la page est réellement défilée avant le coup.
test.use({ viewport: { width: 360, height: 480 } });

const scrollY = (page: Page): Promise<number> => page.evaluate(() => Math.round(window.scrollY));

/** Fait défiler la page jusqu'à `target` comme le joueur qui va le chercher, et exige un défilement réel. */
async function scrollTo(page: Page, target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const y = await scrollY(page);
    console.log(`avant le coup : scrollY=${y}`);
    expect(y, 'page non défilée avant le coup').toBeGreaterThan(0);
}
/** Relevé immédiat : le retour en haut se fait dans le geste, avant le tour de l'ordinateur. */
async function expectBackOnTop(page: Page): Promise<void> {
    const y = await scrollY(page);
    console.log(`après le coup : scrollY=${y}`);
    expect(y, 'la page reste défilée après le coup').toBe(0);
    await expect(page.locator('.board')).toBeFocused();
}
async function deadPosition(page: Page): Promise<void> {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    await expect(page.getByTestId('dead-position')).toBeVisible();
}

// En position morte, l'ordinateur passe aussitôt après le joueur : la partie se termine. L'écran de fin, sur un
// écran très bas, reste plus haut que la fenêtre : sans retour en haut, il s'ouvrirait défilé.
async function expectEndOnTop(page: Page): Promise<void> {
    const y = await scrollY(page);
    console.log(`après le coup : scrollY=${y}`);
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    const end = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight, scrollY: Math.round(window.scrollY) }));
    console.log(`écran de fin : ${JSON.stringify(end)}`);
    expect(end.scrollHeight, 'écran de fin trop court pour distinguer un retour en haut').toBeGreaterThan(end.innerHeight + 50);
    expect(y, 'la page reste défilée après le coup').toBe(0);
    expect(end.scrollY, 'l’écran de fin s’ouvre défilé').toBe(0);
}
test.describe('very low screen', () => {
    test.use({ viewport: { width: 360, height: 320 } });
    test('the Pass button brings the top of the game back', async ({ page }) => {
        await deadPosition(page);
        const pass = page.getByRole('button', { name: 'Passer' });
        await scrollTo(page, pass);
        await pass.click();
        await expectEndOnTop(page);
    });
    test('the P shortcut brings the top of the game back', async ({ page }) => {
        await deadPosition(page);
        await scrollTo(page, page.getByRole('button', { name: 'Passer' }));
        await page.keyboard.press('p');
        await expectEndOnTop(page);
    });
});

test('the Confirm exchange button brings the top of the game back', async ({ page }) => {
    await deadPosition(page);
    const exchange = page.getByRole('button', { name: 'Échanger' });
    await exchange.scrollIntoViewIfNeeded();
    await exchange.click();
    await handTiles(page).first().click();
    const confirm = page.getByRole('button', { name: 'Confirmer l’échange' });
    await expect(confirm).toBeEnabled();
    await scrollTo(page, confirm);
    await confirm.click();
    await expectBackOnTop(page);
});

test('the Enter shortcut in exchange mode brings the top of the game back', async ({ page }) => {
    await deadPosition(page);
    await page.keyboard.press('e');
    await page.keyboard.press('1');
    await expect(page.getByRole('button', { name: 'Confirmer l’échange' })).toBeEnabled();
    await scrollTo(page, page.getByTestId('history'));
    // Entrée sur un bouton active ce bouton : le raccourci ne vaut que hors des boutons.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
    await page.keyboard.press('Enter');
    await expectBackOnTop(page);
});

test('the V shortcut brings the top of the game back', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    if (await board(page).getAttribute('data-tiles') === '0') {
        await handTiles(page).first().click();
        await tapCentre(page);
    } else {
        await page.getByRole('button', { name: 'Indice' }).click();
    }
    await expect(page.getByTestId('preview')).toHaveText(/^Coup prévu/, { timeout: 15_000 });
    await scrollTo(page, page.getByTestId('history'));
    await page.keyboard.press('v');
    await expectBackOnTop(page);
    await expect(page.getByTestId('history')).toContainText('Toi');
});

// Une fin de tour refusée (rien n'est joué) ne déplace ni la vue ni le focus ; le refus est annoncé.
async function expectRefused(page: Page, key: string, message: string | RegExp): Promise<void> {
    const before = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), focus: document.activeElement?.outerHTML.slice(0, 80) ?? '' }));
    console.log(`avant ${key} : ${JSON.stringify(before)}`);
    expect(before.scrollY, 'page non défilée avant le coup').toBeGreaterThan(0);
    await page.keyboard.press(key);
    const after = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), focus: document.activeElement?.outerHTML.slice(0, 80) ?? '' }));
    console.log(`après ${key} : ${JSON.stringify(after)}`);
    expect(after.scrollY, 'la vue a bougé alors que rien n’a été joué').toBe(before.scrollY);
    expect(after.focus, 'le focus a bougé alors que rien n’a été joué').toBe(before.focus);
    await expect(page.locator('.board')).not.toBeFocused();
    await expect(page.getByTestId('announce')).toHaveText(message);
}

test('a refused V from a scrolled page leaves the scroll and focus where they were', async ({ page }) => {
    await deadPosition(page);
    await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await page.getByTestId('history').scrollIntoViewIfNeeded();
    await expectRefused(page, 'v', 'Aucun coup prévu');
});

test('a refused P from a scrolled page leaves the scroll and focus where they were', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    // Une pose est possible : Passer n'est pas proposé.
    await expect(page.getByRole('button', { name: 'Passer' })).toHaveCount(0);
    await page.getByTestId('history').scrollIntoViewIfNeeded();
    await expectRefused(page, 'p', 'Passer n’est pas permis');
});

test('a refused Enter with no tile to exchange leaves the scroll and focus where they were', async ({ page }) => {
    await deadPosition(page);
    await page.keyboard.press('e');
    await expect(page.getByRole('button', { name: 'Confirmer l’échange' })).toBeDisabled();
    await page.getByTestId('history').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
    await expectRefused(page, 'Enter', 'Échange : aucune tuile choisie');
});
