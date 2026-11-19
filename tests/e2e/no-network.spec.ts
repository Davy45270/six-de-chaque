import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { board, myTurn, newGame, openApp, playByHint } from './helpers';

// Plusieurs tours contre l'ordinateur : aucune requête ne quitte l'origine de l'application.
test('no request leaves the application origin', async ({ page, context }) => {
    test.setTimeout(180_000);
    const requests: string[] = [];
    context.on('request', r => requests.push(r.url()));
    const errors = await openApp(page, 'reseau');
    await newGame(page);
    await expect(board(page)).toBeVisible();
    const rounds = 5;
    for (let i = 0; i < rounds; i++) {
        await myTurn(page);
        await playByHint(page);
        await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    }
    await myTurn(page);
    // L'ordinateur a bien joué à chaque tour.
    await expect(page.getByTestId('history').locator('li').filter({ hasText: /^Ordinateur/ })).toHaveCount(rounds);
    const origin = new URL(page.url()).origin;
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter(u => !u.startsWith(`${origin}/`) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(errors).toEqual([]);
});

// Chaque requête de même origine émise pendant plusieurs tours désigne un fichier livré dans `dist/` (lu sur le
// disque) ; aucune autre route, aucune requête autre que GET (ni POST, ni balise d'envoi).
test('every same-origin request during play is a file of the built application', async ({ page, context }) => {
    test.setTimeout(180_000);
    const distFiles = new Set(readdirSync('dist', { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => relative('dist', join(entry.parentPath, entry.name)).split(sep).join('/')));
    expect(distFiles.has('index.html')).toBe(true);
    const requests: Array<{ url: string; method: string; type: string }> = [];
    context.on('request', r => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    const errors = await openApp(page, 'reseau');
    await newGame(page);
    await expect(board(page)).toBeVisible();
    for (let i = 0; i < 5; i++) {
        await myTurn(page);
        await playByHint(page);
        await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    }
    await myTurn(page);
    const origin = new URL(page.url()).origin;
    const sameOrigin = requests.filter(r => r.url.startsWith(`${origin}/`));
    expect(sameOrigin.length).toBeGreaterThan(0);
    expect(requests.filter(r => r.method !== 'GET' || r.type === 'ping'), 'requêtes autres que GET').toEqual([]);
    // La racine de l'application sert `index.html` ; toute autre adresse doit nommer un fichier du build.
    const outside = sameOrigin.map(r => {
        const path = decodeURIComponent(new URL(r.url).pathname).replace(/^\//, '');
        return path === '' ? 'index.html' : path;
    }).filter(path => !distFiles.has(path));
    expect(outside, 'adresses de même origine hors des fichiers de dist/').toEqual([]);
    expect(errors).toEqual([]);
});

// Parcours élargi : réglages (contraste, daltonien), un défi ouvert, l'export d'une partie terminée puis son
// import, et quelques tours contre l'ordinateur. Chaque requête de même origine est un GET d'un fichier de `dist/`
// sans chaîne de requête ni fragment ; aucune autre origine (hors `data:` et `blob:`, locales), aucune balise
// d'envoi. La page est ouverte sans `?seed=` pour que la seule adresse à paramètres ne vienne pas du test.
test('no request carries a query string or leaves the built files, across settings, import, challenges and play', async ({ page, context }, testInfo) => {
    test.setTimeout(240_000);
    const distFiles = new Set(readdirSync('dist', { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => relative('dist', join(entry.parentPath, entry.name)).split(sep).join('/')));
    expect(distFiles.has('index.html')).toBe(true);
    const requests: Array<{ url: string; method: string; type: string }> = [];
    context.on('request', r => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    // Toute balise d'envoi est comptée, même si le navigateur ne la montre pas comme requête.
    await context.addInitScript(() => {
        const w = window as unknown as { __beacons: string[] };
        w.__beacons = [];
        if (typeof navigator.sendBeacon === 'function') {
            const original = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => { w.__beacons.push(String(url)); return original(url, data); };
        }
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Six de chaque' })).toBeVisible();

    // Réglages.
    for (const name of ['Contraste élevé', 'Mode daltonien']) {
        await page.getByLabel(name).click();
        await expect(page.getByLabel(name)).toBeChecked();
    }
    await expect(page.locator('html')).toHaveClass(/\bhc\b/);

    // Défis : ouvrir le premier, puis revenir à l'accueil.
    await page.getByRole('button', { name: 'Défis', exact: true }).click();
    await page.getByRole('button', { name: /^Défi 1\.1/ }).click();
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Accueil' }).click();

    // Une partie terminée est exportée, puis ce fichier exporté est réimporté.
    await page.getByTestId('import-file').setInputFiles('tests/fixtures/blocked.json');
    await expect(board(page)).toBeVisible();
    const pass = page.getByRole('button', { name: 'Passer' });
    await expect(pass).toBeVisible({ timeout: 20_000 });
    await pass.click();
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter la partie' }).click()]);
    const exported = testInfo.outputPath('export.json');
    await download.saveAs(exported);
    expect((JSON.parse(readFileSync(exported, 'utf8')) as { format?: unknown }).format).toBe('six-de-chaque-save');
    await page.getByRole('button', { name: 'Accueil' }).click();
    await page.getByTestId('import-file').setInputFiles(exported);
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await expect(page.getByTestId('winner')).toHaveText('Victoire : Toi');
    await page.getByRole('button', { name: 'Accueil' }).click();

    // Quelques tours, réglages actifs.
    await newGame(page);
    await expect(board(page)).toBeVisible();
    for (let i = 0; i < 3; i++) {
        await myTurn(page);
        await playByHint(page);
        await expect(page.getByTestId('turn')).not.toHaveText(/^À toi/);
    }
    await myTurn(page);

    const origin = new URL(page.url()).origin;
    const sameOrigin = requests.filter(r => r.url.startsWith(`${origin}/`));
    expect(sameOrigin.length).toBeGreaterThan(0);
    expect(requests.filter(r => !r.url.startsWith(`${origin}/`) && !r.url.startsWith('data:') && !r.url.startsWith('blob:')), 'autres origines').toEqual([]);
    expect(requests.filter(r => r.method !== 'GET' || r.type === 'ping' || r.type === 'beacon'), 'requêtes autres que GET ou balises').toEqual([]);
    expect(sameOrigin.filter(r => { const u = new URL(r.url); return u.search !== '' || u.hash !== '' || r.url.includes('?') || r.url.includes('#'); }),
        'chaîne de requête ou fragment').toEqual([]);
    const outside = sameOrigin.map(r => {
        const path = decodeURIComponent(new URL(r.url).pathname).replace(/^\//, '');
        return path === '' ? 'index.html' : path;
    }).filter(path => !distFiles.has(path));
    expect(outside, 'adresses de même origine hors des fichiers de dist/').toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __beacons: string[] }).__beacons), 'balises d’envoi').toEqual([]);
    expect(errors).toEqual([]);
});

// Rejeu d'une partie terminée (import de la partie bloquée, l'humain passe en dernier) : ouvrir le rejeu puis
// naviguer Début, Suivant, Fin. Chaque requête de même origine émise depuis le chargement est un GET d'un fichier de
// `dist/` sans chaîne de requête ni fragment ; aucune autre origine (hors `data:` et `blob:`). La page est ouverte
// sans `?seed=` pour qu'aucune adresse à paramètres ne vienne du test.
test('opening the replay at the end of a game sends no request outside the built files', async ({ page, context }) => {
    test.setTimeout(120_000);
    const distFiles = new Set(readdirSync('dist', { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => relative('dist', join(entry.parentPath, entry.name)).split(sep).join('/')));
    expect(distFiles.has('index.html')).toBe(true);
    const requests: Array<{ url: string; method: string; type: string }> = [];
    context.on('request', r => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Six de chaque' })).toBeVisible();

    await page.getByTestId('import-file').setInputFiles('tests/fixtures/blocked.json');
    await expect(board(page)).toBeVisible();
    const pass = page.getByRole('button', { name: 'Passer' });
    await expect(pass).toBeVisible({ timeout: 20_000 });
    await pass.click();
    await expect(page.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();

    await page.getByRole('button', { name: 'Revoir la partie' }).click();
    await expect(page.getByRole('heading', { name: 'Rejeu' })).toBeVisible();
    const step = page.getByTestId('replay-step');
    await expect(step).toContainText(' — Tu passes.');
    await page.getByRole('button', { name: 'Début' }).click();
    await expect(step).toContainText('Coup 0');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(step).toHaveText(/^Coup 1 sur /);
    await page.getByRole('button', { name: 'Fin' }).click();
    await expect(step).toContainText(' — Tu passes.');
    // Laisse partir une éventuelle requête différée avant le relevé.
    await page.waitForLoadState('networkidle');

    const origin = new URL(page.url()).origin;
    const sameOrigin = requests.filter(r => r.url.startsWith(`${origin}/`));
    expect(sameOrigin.length).toBeGreaterThan(0);
    expect(requests.filter(r => !r.url.startsWith(`${origin}/`) && !r.url.startsWith('data:') && !r.url.startsWith('blob:')), 'autres origines').toEqual([]);
    expect(requests.filter(r => r.method !== 'GET' || r.type === 'ping' || r.type === 'beacon'), 'requêtes autres que GET ou balises').toEqual([]);
    expect(sameOrigin.filter(r => { const u = new URL(r.url); return u.search !== '' || u.hash !== '' || r.url.includes('?') || r.url.includes('#'); }),
        'chaîne de requête ou fragment').toEqual([]);
    const outside = sameOrigin.map(r => {
        const path = decodeURIComponent(new URL(r.url).pathname).replace(/^\//, '');
        return path === '' ? 'index.html' : path;
    }).filter(path => !distFiles.has(path));
    expect(outside, 'adresses de même origine hors des fichiers de dist/').toEqual([]);
    expect(errors).toEqual([]);
});
