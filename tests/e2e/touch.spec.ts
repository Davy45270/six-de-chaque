import { test, expect } from '@playwright/test';
import { board, handTiles, myTurn, openApp, playByHint } from './helpers';

// Un tour joué au doigt : tap sur une tuile de la main, tap sur le plateau, tap sur « Valider ».
test('touch: a turn played with real taps', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'projet sans écran tactile');
    const errors = await openApp(page, 'toucher');
    await page.getByRole('button', { name: 'Nouvelle partie' }).tap();
    await page.getByRole('button', { name: 'Commencer' }).tap();
    await expect(board(page)).toBeVisible();
    await myTurn(page);
    await expect(handTiles(page)).toHaveCount(6);
    const tile = handTiles(page).first();
    await tile.tap();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    // Le plateau est vide : son centre est l'origine. Tap à l'écran, pas de clic souris.
    const box = await board(page).boundingBox();
    if (!box) throw new Error('plateau absent');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(board(page)).toHaveAttribute('data-ghost', '1');
    await expect(page.getByTestId('preview')).toHaveText('Coup prévu : 1 point');
    await page.getByRole('button', { name: 'Valider' }).tap();
    await expect(page.getByTestId('score-j1')).toHaveText('1');
    await expect(board(page)).toHaveAttribute('data-tiles', '1');
    await expect(page.getByTestId('history')).toContainText('Toi :');
    // Deuxième tour, toujours au doigt : « Indice » puis « Valider ».
    await expect(page.getByTestId('history')).toContainText('Ordinateur', { timeout: 20_000 });
    await myTurn(page);
    const tilesBefore = Number(await board(page).getAttribute('data-tiles'));
    const gone = await playByHint(page, l => l.tap());
    await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    if (gone.length) await expect(board(page)).not.toHaveAttribute('data-tiles', String(tilesBefore));
    expect(errors).toEqual([]);
});
