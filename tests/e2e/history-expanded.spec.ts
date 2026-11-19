import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { myTurn } from './helpers';

// « Tout l'historique » déplie la liste : chaque coup de la partie y figure, du dernier au premier, et chaque ligne
// se lit en entier une fois amenée à l'écran, sans que la page déborde en largeur.
test('the expanded move history shows every move, each line fully visible after scrolling, without horizontal overflow', async ({ page }) => {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    // Nombre de coups joués : celui de la position d'exemple, lu dans ses données (source indépendante de l'écran).
    const played = (JSON.parse(readFileSync('apps/web/data/exemples.json', 'utf8')) as { examples: Record<string, { turn: number }> }).examples['position-morte']?.turn;
    expect(played, 'nombre de coups de la position d’exemple').toBeGreaterThan(0);

    const list = page.getByTestId('history');
    const items = list.locator('li');
    const toggle = page.getByRole('button', { name: /^Tout l'historique/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    // Le libellé change une fois déplié : le bouton est retrouvé par la liste qu'il commande.
    const listId = await list.getAttribute('id');
    expect(listId).toBeTruthy();
    const expanded = page.locator(`button[aria-controls="${listId}"]`);
    await expect(expanded).toHaveAttribute('aria-expanded', 'true');

    await expect(items).toHaveCount(played!);
    const numbers = await items.evaluateAll(els => els.map(el => (el as HTMLLIElement).value));
    expect(numbers[0], 'le plus récent porte le nombre de coups joués').toBe(played);
    expect(numbers, 'le premier coup de la partie figure dans la liste').toContain(1);
    expect(new Set(numbers).size, 'numéros distincts').toBe(played);

    const last = items.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveJSProperty('value', 1);
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'débordement horizontal').toBe(true);
});
