import { test, expect } from '@playwright/test';
import { board, handTiles, myTurn, newGame, openApp } from './helpers';
import { tabTo } from './keyboard-nav';

// Les boutons de la main gardent leur numéro (« 2 : … ») quand une tuile est posée en fantôme : la touche du
// clavier désigne la tuile annoncée sous ce numéro, jamais une tuile renumérotée en silence.
test('after a placement, key 2 selects the tile announced as 2', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await tabTo(page, board(page));
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await expect(handTiles(page).first()).toHaveAccessibleName(/^1 : .*, posée$/);
    await page.keyboard.press('2');
    const pressed = handTiles(page).and(page.locator('[aria-pressed="true"]'));
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveAccessibleName(/^2 : /);
    // La touche d'une tuile déjà posée ne sélectionne rien d'autre.
    await page.keyboard.press('1');
    await expect(pressed).toHaveAccessibleName(/^2 : /);
});
