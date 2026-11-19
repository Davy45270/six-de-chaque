import { test, expect } from '@playwright/test';
import { board, handIds, myTurn, newGame, openApp } from './helpers';

// Le tirage calculé dans le navigateur pour la graine « clavier » est le vecteur de référence du moteur
// (packages/engine/test/draw-order.test.ts) : même main initiale, même réserve, sur chaque moteur de rendu.
test('the draw order for seed clavier matches the reference vector in the browser', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    expect(await handIds(page)).toEqual(['t-000', 't-010', 't-043', 't-020', 't-037', 't-001']);
    // Personne n'a encore joué si le plateau est vide : la réserve compte alors 108 − 2 × 6 tuiles.
    if (await board(page).getAttribute('data-tiles') === '0') await expect(page.getByTestId('bag')).toHaveText('Réserve : 96');
});
