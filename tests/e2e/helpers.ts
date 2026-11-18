import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Ouvre le jeu avec une graine fixe et rend la liste des erreurs de page. */
export async function openApp(page: Page, seed = 'essai'): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`./?seed=${seed}`);
    await expect(page.getByRole('heading', { name: 'Six de chaque' })).toBeVisible();
    return errors;
}
/** Nouvelle partie ; `kinds` = valeur du choix « Qui joue » pour chaque joueur (défaut : toi contre l'ordinateur). */
export async function newGame(page: Page, kinds?: string[]): Promise<void> {
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    if (kinds) {
        await page.getByLabel('Nombre de joueurs').selectOption(String(kinds.length));
        for (const [i, kind] of kinds.entries()) await page.getByRole('group', { name: `Joueur ${i + 1}` }).getByLabel('Qui joue').selectOption(kind);
    }
    await page.getByRole('button', { name: 'Commencer' }).click();
}
export const board = (page: Page): Locator => page.locator('.board[data-ready="oui"]');
export async function myTurn(page: Page): Promise<void> {
    await expect(page.getByTestId('turn')).toHaveText(/^À toi/, { timeout: 20_000 });
}
/** Touche la case centrale du plateau (l'origine, sur un plateau vide). */
export async function tapCentre(page: Page): Promise<void> {
    const b = board(page);
    const box = await b.boundingBox();
    if (!box) throw new Error('plateau absent');
    await b.click({ position: { x: box.width / 2, y: box.height / 2 } });
}
export const handTiles = (page: Page): Locator => page.getByTestId('hand').locator('button[data-tile]');
