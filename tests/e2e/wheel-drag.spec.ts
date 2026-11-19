import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { board, myTurn, newGame, openApp, playByHint } from './helpers';

/** Capture du plateau une fois l'image stable (deux captures identiques de suite). */
async function stableShot(page: Page): Promise<Buffer> {
    let prev = await board(page).screenshot();
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150);
        const next = await board(page).screenshot();
        if (next.equals(prev)) return next;
        prev = next;
    }
    throw new Error('le plateau ne se stabilise pas');
}

test('wheel zooms and drag pans the board', async ({ page, browserName }, testInfo) => {
    test.skip(browserName === 'webkit' && Boolean(testInfo.project.use.isMobile), 'pas de molette sur WebKit mobile (Playwright)');
    const errors = await openApp(page, 'molette');
    await newGame(page);
    await myTurn(page);
    // Un tour joué pour que le plateau porte des tuiles.
    await playByHint(page);
    await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    await myTurn(page);
    const tiles = await board(page).getAttribute('data-tiles');
    const box = await board(page).boundingBox();
    if (!box) throw new Error('plateau absent');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const scrollBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
    const start = await stableShot(page);
    // Molette au centre du plateau : la vue zoome.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    const zoomed = await stableShot(page);
    expect(zoomed.equals(start), 'la molette ne change pas la vue').toBe(false);
    // La molette ne fait pas défiler la page.
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scrollBefore);
    // Glisser à la souris : la vue se déplace, sans poser de tuile.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 6 });
    await page.mouse.move(cx + 120, cy + 80, { steps: 6 });
    await page.mouse.up();
    const panned = await stableShot(page);
    expect(panned.equals(zoomed), 'le glisser ne change pas la vue').toBe(false);
    await expect(board(page)).toHaveAttribute('data-ghost', '0');
    await expect(board(page)).toHaveAttribute('data-tiles', tiles ?? '');
    expect(errors).toEqual([]);
});
