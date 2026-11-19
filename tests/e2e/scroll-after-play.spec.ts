import { test, expect } from '@playwright/test';
import { board, handTiles, myTurn, newNamedGame, openApp, tapCentre } from './helpers';

// Quatre joueurs aux noms longs : les cartes de score poussent « Valider » sous le bas de l'écran d'un téléphone,
// le joueur fait défiler la page pour le toucher. Une fois le coup joué, le haut de la partie (scores, tour,
// plateau) doit revenir à l'écran sans geste de sa part, et le focus ne doit pas se perdre sur la page.
for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });
        test('the page does not stay scrolled down after a validated turn', async ({ page }) => {
            test.setTimeout(90_000);
            await openApp(page, 'quatre-longs');
            await newNamedGame(page, [
                { name: 'Joueuse au long nom', kind: 'human' }, { name: 'Ordinateur numéro 2', kind: 'beginner' },
                { name: 'Ordinateur numéro 3', kind: 'intermediate' }, { name: 'Ordinateur numéro 4', kind: 'beginner' }]);
            await expect(board(page)).toBeVisible();
            await myTurn(page);
            // Plateau vide : une tuile de la main, puis la case centrale. Sinon (un ordinateur a ouvert), « Indice » pose un coup légal.
            if (await board(page).getAttribute('data-tiles') === '0') {
                await handTiles(page).first().click();
                await tapCentre(page);
            } else {
                await page.getByRole('button', { name: 'Indice' }).click();
            }
            await expect(page.getByTestId('preview')).toHaveText(/^Coup prévu/, { timeout: 15_000 });
            const validate = page.getByRole('button', { name: 'Valider' });
            // Le joueur fait défiler la page jusqu'au bas du panneau : la page doit être réellement défilée avant le coup.
            await page.getByTestId('history').scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => window.scrollY), 'page non défilée avant Valider').toBeGreaterThan(0);
            const before = await validate.evaluate(el => ({ top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom), innerHeight: window.innerHeight }));
            console.log(`avant Valider : ${JSON.stringify(before)}`);
            await validate.click();
            const after = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), focus: document.activeElement?.className ?? '' }));
            console.log(`après Valider : ${JSON.stringify(after)}`);
            expect(after.scrollY, 'la page reste défilée juste après Valider').toBe(0);
            await expect(page.getByTestId('history')).toContainText('Joueuse au long nom');
            // Les trois ordinateurs jouent, puis c'est de nouveau au joueur.
            await myTurn(page);
            console.log(`tour suivant : scrollY=${await page.evaluate(() => Math.round(window.scrollY))}`);
            await expect(page.getByRole('list', { name: 'Scores' })).toBeInViewport({ ratio: 1 });
            await expect(page.getByTestId('turn')).toBeInViewport({ ratio: 1 });
            await expect(board(page)).toBeInViewport({ ratio: 0.9 });
            // Le focus reste sur un élément de la partie, pas sur le corps de la page.
            await expect(board(page)).toBeFocused();
        });
    });
}
