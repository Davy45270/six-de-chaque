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

export type PlayerKind = 'human' | 'beginner' | 'intermediate';
/** Nouvelle partie nommée : chaque joueur reçoit un nom saisi au clavier et un type choisi dans « Qui joue ». */
export async function newNamedGame(page: Page, players: { name: string; kind: PlayerKind }[]): Promise<void> {
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await page.getByLabel('Nombre de joueurs').selectOption(String(players.length));
    for (const [i, p] of players.entries()) {
        const row = page.getByRole('group', { name: `Joueur ${i + 1}` });
        await row.getByLabel('Nom').fill(p.name);
        await row.getByLabel('Qui joue').selectOption(p.kind);
    }
    await page.getByRole('button', { name: 'Commencer' }).click();
}
/** Identifiants des tuiles affichées dans la main, dans l'ordre. */
export async function handIds(page: Page): Promise<string[]> {
    return handTiles(page).evaluateAll(els => els.map(e => e.getAttribute('data-tile') ?? ''));
}
/**
 * Joue le tour humain courant par les boutons, comme un joueur : « Indice » propose une pose, « Valider » la joue.
 * Sans pose proposée : « Passer » s'il est offert, sinon « Échanger » la première tuile.
 * Rend les tuiles qui ont quitté la main (posées ou échangées).
 */
export async function playByHint(page: Page, press: (l: Locator) => Promise<void> = l => l.click()): Promise<string[]> {
    const before = await handIds(page);
    await press(page.getByRole('button', { name: 'Indice' }));
    const proposed = await expect(page.getByTestId('preview')).toHaveText(/^Coup prévu/, { timeout: 15_000 }).then(() => true, () => false);
    if (proposed) {
        const placed = await page.getByTestId('hand').locator('button.tile.placed').evaluateAll(els => els.map(e => e.getAttribute('data-tile') ?? ''));
        expect(placed.length).toBeGreaterThan(0);
        await press(page.getByRole('button', { name: 'Valider' }));
        return placed;
    }
    const pass = page.getByRole('button', { name: 'Passer' });
    if (await pass.count()) { await press(pass); return []; }
    await press(page.getByRole('button', { name: 'Échanger' }));
    await press(handTiles(page).first());
    await press(page.getByRole('button', { name: 'Confirmer l’échange' }));
    return before.slice(0, 1);
}
