import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { replay, stateHash } from '@six-de-chaque/engine';
import { readFileSync } from 'node:fs';
import { replayExample } from '../../apps/web/src/game/examples';
import type { ExampleData } from '../../apps/web/src/game/examples';
import { cellToScreen, fitBoard } from '../../packages/renderer-pixi/src/camera';

const example = 'fin-main-vide';
const CELL_PX = 64;

async function openReplay(page: Page): Promise<void> {
    await page.goto('./?exemple=fin-main-vide');
    await page.getByRole('button', { name: 'Revoir la partie' }).click();
    await expect(page.getByRole('heading', { name: 'Rejeu' })).toBeVisible();
}

test('at 390x844 every tile of the fin-main-vide board is inside the canvas, in play and in replay', async ({ page }) => {
    const examples = JSON.parse(readFileSync(new URL('../../apps/web/data/exemples.json', import.meta.url), 'utf8')) as ExampleData;
    const { ui: { config, session } } = replayExample(example, examples);
    const events = session.events.slice(0, 106);
    const state = replay(config, session.state.seed, events);
    const cells = Object.keys(state.board);
    expect(state.phase).not.toBe('finished');

    async function expectBoardInsideCanvas(): Promise<void> {
        const board = page.locator('.board[data-ready="oui"]');
        await expect(board).toHaveAttribute('data-tiles', String(cells.length));
        const box = await board.locator('canvas').boundingBox();
        if (!box) throw new Error('Canevas absent');
        const camera = fitBoard(state.board, box.width, box.height, CELL_PX);
        for (const key of cells) {
            const [x, y] = key.split(':').map(Number) as [number, number];
            const start = cellToScreen(camera, x, y, CELL_PX);
            const end = cellToScreen(camera, x + 1, y + 1, CELL_PX);
            expect(start.px, key).toBeGreaterThanOrEqual(0);
            expect(start.py, key).toBeGreaterThanOrEqual(0);
            expect(end.px, key).toBeLessThanOrEqual(box.width);
            expect(end.py, key).toBeLessThanOrEqual(box.height);
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.getByTestId('import-file').setInputFiles({
        name: 'partie.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
            format: 'six-de-chaque-save', version: state.version, seed: state.seed,
            snapshot: state, events, config, checksum: stateHash(state)
        }))
    });
    await expect(page.getByTestId('turn')).toHaveText(/^À toi/);
    await expectBoardInsideCanvas();

    await openReplay(page);
    await page.getByRole('button', { name: 'Précédent' }).click();
    await expect(page.getByTestId('replay-step')).toHaveText(/^Coup 106 sur 107/);
    await expectBoardInsideCanvas();
});

test('in replay the zoom buttons are reachable by keyboard', async ({ page }) => {
    await openReplay(page);
    const board = page.getByRole('img', { name: 'Plateau au coup 107' });
    const zoomIn = page.getByRole('button', { name: 'Zoomer', exact: true });
    const zoomOut = page.getByRole('button', { name: 'Dézoomer', exact: true });
    await expect(board).toHaveAttribute('data-ready', 'oui');
    await board.focus();
    await expect(board).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(zoomIn).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(zoomOut).toBeFocused();
    await page.keyboard.press('Space');
});
