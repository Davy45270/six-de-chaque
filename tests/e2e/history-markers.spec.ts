import { test, expect } from '@playwright/test';
import { myTurn } from './helpers';

// Chaque coup de « Derniers coups » porte son numéro dans la partie : la puce numérotée de la liste doit se voir.
test('the move numbers of the history are visible', async ({ page }) => {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    const items = page.getByTestId('history').locator('li');
    await expect(items).toHaveCount(12);
    const markers = await items.evaluateAll(els => els.map(el => {
        const m = getComputedStyle(el, '::marker');
        return { color: m.color, type: getComputedStyle(el).listStyleType, visibility: m.visibility };
    }));
    console.log(`puces : ${JSON.stringify(markers[0])}`);
    for (const m of markers) {
        expect(m.type).not.toBe('none');
        expect(m.visibility).not.toBe('hidden');
        const alpha = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(m.color)?.[1];
        expect(m.color, 'numéro transparent').not.toBe('transparent');
        expect(Number(alpha ?? 1), `numéro transparent (${m.color})`).toBeGreaterThan(0.5);
    }
});
