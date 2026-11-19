import { test, expect } from '@playwright/test';
import { board, handIds, newNamedGame, openApp, playByHint } from './helpers';

const NAMES = ['Ana', 'Bruno', 'Cyril', 'Dina'];

for (const count of [3, 4]) {
    test(`hotseat with ${count} humans hides every other hand`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = await openApp(page, `table-${count}`);
        await newNamedGame(page, NAMES.slice(0, count).map(name => ({ name, kind: 'human' as const })));
        const pass = page.getByRole('heading', { name: /^Passe l’appareil à / });
        const kept = new Map<string, string[]>();
        const seen: string[] = [];
        // Deux tours de table : chaque joueur joue deux fois.
        for (let turn = 0; turn < count * 2; turn++) {
            // Écran de passage : aucune tuile de main, aucun plateau.
            await expect(pass).toBeVisible();
            await expect(page.locator('[data-tile]')).toHaveCount(0);
            await expect(page.getByTestId('hand')).toHaveCount(0);
            const name = (await pass.textContent())?.replace('Passe l’appareil à ', '') ?? '';
            expect(NAMES.slice(0, count)).toContain(name);
            if (turn < count) { expect(seen).not.toContain(name); seen.push(name); } else expect(name).toBe(seen[turn - count]);
            await page.getByRole('button', { name: `C’est moi, ${name}` }).click();
            await expect(board(page)).toBeVisible();
            await expect(page.getByTestId('turn')).toHaveText(`À toi, ${name}`);
            // Une seule main à l'écran, celle du joueur actif.
            await expect(page.getByRole('group', { name: 'Ta main' })).toHaveCount(1);
            await expect(page.locator('[data-tile]')).toHaveCount(6);
            const hand = await handIds(page);
            for (const [other, tiles] of kept) {
                if (other === name) expect(hand, `main de ${name} : ses tuiles gardées`).toEqual(expect.arrayContaining(tiles));
                else expect(hand.filter(t => tiles.includes(t)), `la main de ${other} apparaît chez ${name}`).toEqual([]);
            }
            const gone = await playByHint(page);
            kept.set(name, hand.filter(t => !gone.includes(t)));
        }
        await expect(pass).toBeVisible();
        await expect(page.locator('[data-tile]')).toHaveCount(0);
        // L'historique ne livre aucun identifiant de tuile.
        await page.getByRole('button', { name: /^C’est moi/ }).click();
        await expect(page.getByTestId('history')).not.toContainText('t-');
        expect(errors).toEqual([]);
    });
}
