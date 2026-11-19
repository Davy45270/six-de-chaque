import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { myTurn } from './helpers';

// Chaque coup de « Derniers coups » porte son numéro dans la partie : la puce numérotée de la liste doit se voir.
test('the move numbers of the history are visible', async ({ page }) => {
    await page.goto('./?exemple=position-morte');
    await myTurn(page);
    const list = page.getByTestId('history');
    const items = list.locator('li');
    await expect(items).toHaveCount(12);
    // La liste elle-même est numérotée en décimal : une liste sans puce (« list-style: none ») efface les numéros.
    await expect(list).toHaveCSS('list-style-type', 'decimal');
    const markers = await items.evaluateAll(els => els.map(el => {
        const m = getComputedStyle(el, '::marker');
        return { color: m.color, type: getComputedStyle(el).listStyleType, visibility: m.visibility, content: m.content };
    }));
    console.log(`puces : ${JSON.stringify(markers[0])}`);
    // Les numéros sont ceux des coups dans la partie : distincts, décroissants (le plus récent en premier), et le
    // premier vaut le nombre de coups joués (les puces affichent la propriété value de chaque élément).
    const numbers = await items.evaluateAll(els => els.map(el => (el as HTMLLIElement).value));
    // Nombre de coups joués : celui de la position d'exemple, lu dans ses données (source indépendante de l'écran).
    const played = (JSON.parse(readFileSync('apps/web/data/exemples.json', 'utf8')) as { examples: Record<string, { turn: number }> }).examples['position-morte']?.turn;
    console.log(`numéros : ${numbers.join(', ')}`);
    expect(new Set(numbers).size, `numéros distincts : ${numbers.join(', ')}`).toBe(numbers.length);
    for (let i = 1; i < numbers.length; i++) expect(numbers[i]!, `numéros décroissants : ${numbers.join(', ')}`).toBeLessThan(numbers[i - 1]!);
    expect(numbers[0], 'le premier numéro vaut le nombre de coups joués').toBe(played);
    for (const m of markers) {
        expect(m.type).toBe('decimal');
        // Là où le navigateur expose le contenu de ::marker, il ne doit être ni « none » ni une chaîne vide.
        expect(m.content, `contenu de la puce : ${m.content}`).not.toMatch(/^(none|""|'')$/);
        expect(m.visibility).not.toBe('hidden');
        const alpha = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(m.color)?.[1];
        expect(m.color, 'numéro transparent').not.toBe('transparent');
        expect(Number(alpha ?? 1), `numéro transparent (${m.color})`).toBeGreaterThan(0.5);
    }
});
