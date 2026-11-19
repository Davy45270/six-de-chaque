// @vitest-environment happy-dom
// Un réglage d'apparence choisi puis la page rechargée aussitôt : le choix survit et s'affiche dès le premier rendu,
// même si l'écriture dans IndexedDB n'a pas encore abouti ; la relecture tardive de la base ne l'écrase jamais.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { getSetting, openDb, setSetting } from '../src/storage/db';

type Root = ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let mounted: Root | null = null;

const mount = (): void => {
    host = document.createElement('div');
    document.body.append(host);
    mounted = createRoot(host);
    act(() => { mounted?.render(createElement(App)); });
};
/** Rechargement : démontage puis montage immédiat d'une nouvelle application, sans laisser finir les écritures. */
const reload = (): void => {
    act(() => { mounted?.unmount(); });
    host.remove();
    mount();
};
const settle = async (ms = 30): Promise<void> => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const box = (name: string): HTMLInputElement => {
    const label = [...host.querySelectorAll('label')].find(l => l.textContent.includes(name));
    const input = label?.querySelector('input');
    if (!input) throw new Error(`case absente : ${name}`);
    return input;
};
const click = (name: string): void => { act(() => { box(name).click(); }); };

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
    document.documentElement.className = '';
});
afterEach(() => {
    act(() => { mounted?.unmount(); });
    mounted = null;
    host.remove();
    vi.unstubAllGlobals();
});

for (const name of ['Contraste élevé', 'Mode daltonien']) {
    it(`${name} : coché puis rechargé aussitôt, la case est cochée dès le premier rendu`, async () => {
        mount();
        await settle();
        click(name);
        expect(box(name).checked).toBe(true);
        reload();
        expect(box(name).checked).toBe(true);
        await settle();
        expect(box(name).checked).toBe(true);
        click(name);
        reload();
        expect(box(name).checked).toBe(false);
        await settle();
        expect(box(name).checked).toBe(false);
    });
}

it('la relecture tardive de la base n’écrase pas un choix plus récent', async () => {
    // Base qui garde une ancienne valeur (écriture perdue) : le choix fait depuis l'emporte.
    mount();
    await settle();
    click('Contraste élevé');
    await settle();
    const d = await openDb();
    await setSetting(d, 'highContrast', false);
    d.close();
    reload();
    expect(box('Contraste élevé').checked).toBe(true);
    await settle();
    expect(box('Contraste élevé').checked).toBe(true);
    expect(document.documentElement.classList.contains('hc')).toBe(true);
});

it('le choix finit aussi écrit dans IndexedDB', async () => {
    mount();
    await settle();
    click('Mode daltonien');
    await settle();
    const d = await openDb();
    expect(await getSetting<boolean>(d, 'colourBlind')).toBe(true);
    d.close();
});

it('une base plus ancienne sans valeur de secours reste relue au démarrage', async () => {
    const d = await openDb();
    await setSetting(d, 'highContrast', true);
    d.close();
    mount();
    await settle();
    expect(box('Contraste élevé').checked).toBe(true);
});

it('sans IndexedDB, le choix survit au rechargement', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('indisponible'); } });
    mount();
    await settle();
    click('Contraste élevé');
    reload();
    await settle();
    expect(box('Contraste élevé').checked).toBe(true);
});


it('sans localStorage, la base reste la source et rien ne casse', async () => {
    const broken = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, clear: () => undefined };
    const d = await openDb();
    await setSetting(d, 'colourBlind', true);
    d.close();
    vi.stubGlobal('localStorage', broken);
    mount();
    await settle();
    expect(box('Mode daltonien').checked).toBe(true);
    click('Mode daltonien');
    expect(box('Mode daltonien').checked).toBe(false);
    await settle();
    const again = await openDb();
    expect(await getSetting<boolean>(again, 'colourBlind')).toBe(false);
    again.close();
});

it('un défi réussi est gardé en secours, sans doublon, et ignore une valeur illisible', async () => {
    const { addCompleted, readCompleted } = await import('../src/storage/fallback');
    expect(readCompleted()).toEqual([]);
    addCompleted('a');
    addCompleted('b');
    addCompleted('a');
    expect(readCompleted()).toEqual(['a', 'b']);
    localStorage.setItem('six-de-chaque:completedChallenges', '{pas du json');
    expect(readCompleted()).toEqual([]);
});
