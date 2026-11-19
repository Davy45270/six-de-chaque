import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
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
