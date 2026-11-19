import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { board, myTurn, newNamedGame, openApp, playByHint } from './helpers';

// Police de la CI (DejaVu) imposée : c'est avec elle que le texte déborde, pas avec la police du poste.
const FONT = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important}';

async function noOverflow(page: Page, what: string): Promise<void> {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const m = await page.evaluate(() => {
        const d = document.documentElement;
        const wide = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > d.clientWidth + 0.5)
            .slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`);
        return { scroll: d.scrollWidth, client: d.clientWidth, wide };
    });
    expect(m.scroll, `${what} : ${m.scroll} > ${m.client} (${m.wide.join(' ; ')})`).toBeLessThanOrEqual(m.client);
}

for (const width of [320, 360, 390, 1280]) {
    test(`no horizontal overflow at ${width} px`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 800 });
        await openApp(page, `largeur-${width}`);
        await page.addStyleTag({ content: FONT });
        await noOverflow(page, 'accueil');
        await page.getByRole('button', { name: 'Nouvelle partie' }).click();
        await page.getByLabel('Nombre de joueurs').selectOption('4');
        await noOverflow(page, 'configuration');
        await page.getByRole('button', { name: 'Retour' }).click();
        // Partie la plus large : quatre joueurs aux noms longs, après un tour de table.
        await newNamedGame(page, [
            { name: 'Joueuse au long nom', kind: 'human' }, { name: 'Ordinateur numéro 2', kind: 'beginner' },
            { name: 'Ordinateur numéro 3', kind: 'intermediate' }, { name: 'Ordinateur numéro 4', kind: 'beginner' }
        ]);
        await expect(board(page)).toBeVisible();
        await myTurn(page);
        await noOverflow(page, 'partie');
        await playByHint(page);
        await myTurn(page);
        await noOverflow(page, 'partie après un tour');
        await page.getByRole('button', { name: 'Menu' }).click();
        await noOverflow(page, 'accueil en cours de partie');
    });
}
