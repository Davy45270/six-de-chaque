import { test, expect } from '@playwright/test';
import { board, myTurn, newGame, openApp, playByHint } from './helpers';

// Plusieurs tours contre l'ordinateur : aucune requête ne quitte l'origine de l'application.
test('no request leaves the application origin', async ({ page, context }) => {
    test.setTimeout(180_000);
    const requests: string[] = [];
    context.on('request', r => requests.push(r.url()));
    const errors = await openApp(page, 'reseau');
    await newGame(page);
    await expect(board(page)).toBeVisible();
    const rounds = 5;
    for (let i = 0; i < rounds; i++) {
        await myTurn(page);
        await playByHint(page);
        await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    }
    await myTurn(page);
    // L'ordinateur a bien joué à chaque tour.
    await expect(page.getByTestId('history').locator('li').filter({ hasText: /^Ordinateur/ })).toHaveCount(rounds);
    const origin = new URL(page.url()).origin;
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter(u => !u.startsWith(`${origin}/`) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(errors).toEqual([]);
});
