import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { board, myTurn, openApp } from './helpers';

// Fenêtre de bureau large mais basse : la mise en page « plateau à la hauteur de l'écran » n'a de sens que si la
// hauteur suffit. Sinon l'écran défile : rien ne déborde à droite, le plateau ne sort pas de l'écran de jeu, et
// les boutons + et − restent atteignables. Le plateau d'un défi tient dans l'écran dès que la hauteur le permet.
interface Geometry {
    innerWidth: number; innerHeight: number; scrollWidth: number; playOverflow: number;
    boardTop: number; boardHeight: number; statusHeight: number; turnHeight: number; columns: number;
}
async function geometry(page: Page): Promise<Geometry> {
    return page.evaluate(() => {
        const play = document.querySelector('.play');
        const b = document.querySelector('.board')?.getBoundingClientRect();
        return {
            innerWidth: window.innerWidth, innerHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            playOverflow: play ? play.scrollHeight - play.clientHeight : NaN,
            boardTop: Math.round((b?.top ?? NaN) + window.scrollY), boardHeight: Math.round(b?.height ?? NaN),
            statusHeight: Math.round(document.querySelector('.play .status')?.getBoundingClientRect().height ?? NaN),
            turnHeight: Math.round(document.querySelector('.play .turn')?.getBoundingClientRect().height ?? NaN),
            columns: getComputedStyle(play ?? document.body).gridTemplateColumns.split(' ').length
        };
    });
}
async function openChallenge(page: Page): Promise<void> {
    await openApp(page);
    await page.getByRole('button', { name: 'Défis', exact: true }).click();
    await page.getByRole('button', { name: /^Défi 1\.1/ }).click();
    await myTurn(page);
    await expect(board(page)).toBeVisible();
}

for (const viewport of [{ width: 1024, height: 360 }, { width: 1024, height: 520 }, { width: 1024, height: 600 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });

        test('the board and its zoom buttons stay reachable in a low desktop window', async ({ page }) => {
            await openChallenge(page);
            const g = await geometry(page);
            console.log(`fenêtre basse : ${JSON.stringify(g)}`);
            expect(g.scrollWidth, 'débordement horizontal').toBeLessThanOrEqual(g.innerWidth);
            expect(g.playOverflow, 'le contenu sort de l’écran de jeu').toBeLessThanOrEqual(1);
            expect(g.boardHeight, 'le plateau est plus haut que la fenêtre').toBeLessThanOrEqual(g.innerHeight);
            for (const name of ['Zoomer', 'Dézoomer']) {
                const button = page.getByRole('button', { name, exact: true });
                await button.scrollIntoViewIfNeeded();
                await expect(button).toBeInViewport({ ratio: 1 });
                // Atteignable : rien ne le recouvre en son centre.
                expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })).toBe(true);
            }
            if (viewport.height >= 520) {
                await page.evaluate(() => { window.scrollTo(0, 0); });
                const top = await geometry(page);
                expect(top.boardTop + top.boardHeight, 'le bas du plateau sort de l’écran').toBeLessThanOrEqual(top.innerHeight);
            }
        });
    });
}
