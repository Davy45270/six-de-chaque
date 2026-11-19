import { test, expect } from '@playwright/test';
import { board, myTurn, newNamedGame, openApp, playByHint } from './helpers';

const AIS = [{ name: 'Robot A', kind: 'beginner' as const }, { name: 'Robot B', kind: 'intermediate' as const }, { name: 'Robot C', kind: 'beginner' as const }];

test('one human against three computers', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await openApp(page, 'quatre');
    await newNamedGame(page, [{ name: 'Toi', kind: 'human' }, ...AIS]);
    await expect(board(page)).toBeVisible();
    // Un seul humain : pas d'écran de passage.
    await expect(page.getByRole('heading', { name: /^Passe l’appareil à / })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Scores' }).locator('li')).toHaveCount(4);
    const history = page.getByTestId('history');
    // Deux tours de table : chaque ordinateur joue au moins une fois après l'humain.
    for (let round = 1; round <= 2; round++) {
        await myTurn(page);
        await playByHint(page);
        for (const ai of AIS) await expect(history.locator('li').filter({ hasText: new RegExp(`^${ai.name} `) })).toHaveCount(round, { timeout: 30_000 });
        await myTurn(page);
    }
    // La main de l'humain reste à l'écran entre les tours, les mains des ordinateurs jamais.
    await expect(page.locator('[data-tile]')).toHaveCount(6);
    for (const [i] of AIS.entries()) await expect(page.getByTestId(`score-j${i + 2}`)).toHaveText(/^\d+$/);
    expect(errors).toEqual([]);
});
