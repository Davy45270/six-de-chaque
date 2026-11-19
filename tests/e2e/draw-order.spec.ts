import { test, expect } from '@playwright/test';
import { board, handIds, myTurn, newGame, openApp } from './helpers';

// Le tirage calculé dans le navigateur pour la graine « clavier » est le vecteur de référence du moteur
// (packages/engine/test/draw-order.test.ts) : même main initiale, même réserve, sur chaque moteur de rendu.
test('the draw order for seed clavier matches the reference vector in the browser', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    expect(await handIds(page)).toEqual(['t-000', 't-010', 't-043', 't-020', 't-037', 't-001']);
    // Personne n'a encore joué si le plateau est vide : la réserve compte alors 108 − 2 × 6 tuiles.
    if (await board(page).getAttribute('data-tiles') === '0') await expect(page.getByTestId('bag')).toHaveText('Réserve : 96');
});

// Réserve de référence pour « clavier » (packages/engine/test/draw-order.test.ts), dans l'ordre du tirage.
const CLAVIER_BAG = ('50 99 60 77 23 18 16 54 87 9 72 6 100 83 79 69 15 44 58 64 98 65 96 51 28 46 74 5 97 32 55 39 80 73 71 '
    + '94 62 105 31 7 40 35 49 67 38 107 78 93 42 63 101 70 26 81 82 14 103 17 19 75 25 12 66 8 36 90 89 48 61 91 104 86 52 '
    + '47 76 24 102 11 30 34 56 22 88 13 3 4 2 59 92 84 41 27 68 95 106 45').split(' ').map(n => `t-${n.padStart(3, '0')}`);
const CLAVIER_HANDS = ['0 10 43 20 37 1', '29 53 85 57 21 33'].map(h => h.split(' ').map(n => `t-${n.padStart(3, '0')}`));

interface SavedSnapshot { turnNumber: number; currentPlayerIndex: number; bag: string[]; players: Array<{ hand: string[] }> }

// L'ordre complet de la réserve est lu dans l'instantané que le navigateur écrit dans IndexedDB (comme les
// réglages dans a11y.spec.ts) : il a été calculé par le moteur dans ce navigateur, pas dans Node.
test('the reserve order for seed clavier matches the reference vector in the browser', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    const read = (): Promise<SavedSnapshot[]> => page.evaluate(() => new Promise<SavedSnapshot[]>(resolve => {
        const open = indexedDB.open('six-de-chaque');
        open.onerror = () => { resolve([]); };
        open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('games')) { db.close(); resolve([]); return; }
            const all = db.transaction('games').objectStore('games').getAll();
            all.onsuccess = () => { db.close(); resolve((all.result as Array<{ snapshot: SavedSnapshot }>).map(g => g.snapshot)); };
            all.onerror = () => { db.close(); resolve([]); };
        };
    }));
    // Attendre l'instantané du tour humain (l'ordinateur a pu ouvrir la partie et son tour être écrit après coup).
    await expect.poll(async () => (await read()).map(s => s.currentPlayerIndex), { timeout: 15_000 }).toEqual([0]);
    const [snapshot] = await read();
    if (!snapshot) throw new Error('instantané absent');
    expect(snapshot.players[0]?.hand).toEqual(CLAVIER_HANDS[0]);
    // Le tirage se fait en tête de réserve, sans rebattre lors d'une pose : la réserve restante est la fin exacte
    // du vecteur de référence. Si personne n'a joué, c'est le vecteur entier, tuile par tuile.
    const drawn = CLAVIER_BAG.length - snapshot.bag.length;
    expect(drawn).toBeGreaterThanOrEqual(0);
    expect(drawn).toBeLessThanOrEqual(6);
    expect(snapshot.bag).toEqual(CLAVIER_BAG.slice(drawn));
    if (snapshot.turnNumber === 0) expect(snapshot.bag).toEqual(CLAVIER_BAG);
    else {
        // L'ordinateur a ouvert : il a reçu exactement les `drawn` premières tuiles de la réserve de référence.
        const opponent = snapshot.players[1]?.hand ?? [];
        for (const id of CLAVIER_BAG.slice(0, drawn)) expect(opponent).toContain(id);
        for (const id of opponent) expect([...(CLAVIER_HANDS[1] ?? []), ...CLAVIER_BAG.slice(0, drawn)]).toContain(id);
    }
});

interface SavedEvent { seq: number; action: { type: string; actorId: string; placements?: Array<{ tileId: string }> } }

// L'ORDRE des mains, pas seulement leur contenu : la main humaine affichée et enregistrée est la main de référence
// tuile par tuile ; celle de l'ordinateur aussi s'il n'a pas joué. S'il a ouvert, sa main est ses tuiles restantes
// dans leur ordre d'origine, suivies des tuiles piochées dans l'ordre de la réserve de référence.
test('the first hand drawn for seed clavier matches the reference vector in order', async ({ page }) => {
    await openApp(page, 'clavier');
    await newGame(page);
    await myTurn(page);
    await expect(board(page)).toBeVisible();
    const read = (): Promise<{ snapshots: SavedSnapshot[]; events: SavedEvent[] }> => page.evaluate(() => new Promise(resolve => {
        const empty = { snapshots: [], events: [] };
        const open = indexedDB.open('six-de-chaque');
        open.onerror = () => { resolve(empty); };
        open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('games') || !db.objectStoreNames.contains('events')) { db.close(); resolve(empty); return; }
            const tx = db.transaction(['games', 'events']);
            const games = tx.objectStore('games').getAll();
            const events = tx.objectStore('events').getAll();
            tx.oncomplete = () => {
                db.close();
                resolve({ snapshots: (games.result as Array<{ snapshot: SavedSnapshot }>).map(g => g.snapshot), events: events.result as SavedEvent[] });
            };
            tx.onerror = () => { db.close(); resolve(empty); };
        };
    }));
    await expect.poll(async () => (await read()).snapshots.map(s => s.currentPlayerIndex), { timeout: 15_000 }).toEqual([0]);
    const { snapshots: [snapshot], events } = await read();
    if (!snapshot) throw new Error('instantané absent');
    const [human, computer] = CLAVIER_HANDS;
    if (!human || !computer) throw new Error('vecteur de référence');
    // Main humaine : ordre exact, à l'écran comme dans l'instantané.
    expect(await handIds(page)).toEqual(human);
    expect(snapshot.players[0]?.hand).toEqual(human);
    const opponent = snapshot.players[1]?.hand;
    if (snapshot.turnNumber === 0) {
        expect(events).toEqual([]);
        expect(opponent).toEqual(computer);
        return;
    }
    // L'ordinateur a ouvert : un seul coup, une pose, enregistrée au journal.
    expect(snapshot.turnNumber).toBe(1);
    expect(events).toHaveLength(1);
    const [opening] = events;
    expect(opening?.seq).toBe(0);
    expect(opening?.action.type).toBe('PLACE');
    const placed = new Set((opening?.action.placements ?? []).map(p => p.tileId));
    expect(placed.size).toBeGreaterThan(0);
    for (const id of placed) expect(computer).toContain(id);
    const drawn = CLAVIER_BAG.length - snapshot.bag.length;
    expect(drawn).toBe(placed.size);
    expect(opponent).toEqual([...computer.filter(id => !placed.has(id)), ...CLAVIER_BAG.slice(0, drawn)]);
    expect(snapshot.bag).toEqual(CLAVIER_BAG.slice(drawn));
});
