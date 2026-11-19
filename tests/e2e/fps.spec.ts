import { test, expect } from '@playwright/test';
import { board } from './helpers';

// Mesure, sans seuil : images par seconde (requestAnimationFrame) pendant un glisser de 2 s sur le plateau
// de la partie d'exemple finie, ouverte dans le rejeu. La valeur et le navigateur sont annotés et journalisés.
test('board rendering frame rate is measured', async ({ page, browserName }, testInfo) => {
    await page.goto('./?exemple=fin');
    await page.getByRole('button', { name: 'Revoir la partie' }).click();
    await expect(board(page)).toBeVisible();
    expect(Number(await board(page).getAttribute('data-tiles'))).toBeGreaterThan(0);
    const box = await board(page).boundingBox();
    if (!box) throw new Error('plateau absent');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.evaluate(() => {
        const w = window as unknown as { __frames: number; __counting: boolean };
        w.__frames = 0; w.__counting = true;
        const tick = (): void => { if (!w.__counting) return; w.__frames++; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    });
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Glisser continu de 2 s d'horloge, en boucle : la durée ne dépend pas de la vitesse de chaque déplacement.
    const start = Date.now();
    while (Date.now() - start < 2000) {
        const a = ((Date.now() - start) / 2000) * Math.PI * 2;
        await page.mouse.move(cx + Math.sin(a) * box.width * 0.3, cy + Math.sin(a * 2) * box.height * 0.2);
    }
    await page.mouse.up();
    const { frames, ms } = await page.evaluate(t => {
        const w = window as unknown as { __frames: number; __counting: boolean };
        w.__counting = false;
        return { frames: w.__frames, ms: performance.now() - t };
    }, t0);
    const fps = frames / (ms / 1000);
    const line = `${testInfo.project.name} (${browserName}) : ${fps.toFixed(1)} images/s, ${frames} images en ${Math.round(ms)} ms`;
    testInfo.annotations.push({ type: 'fps', description: line });
    console.log(`FPS ${line}`);
    expect(fps).toBeGreaterThan(0);
});
