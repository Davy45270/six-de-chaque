// Provenance des images et des sons : chaque fichier binaire ou image du dépôt sort d'un générateur du dépôt.
// Aucune police externe, aucune ressource tierce dans la page.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { glyphSheet } from '../packages/renderer-pixi/src/art';

const ASSET = /\.(png|svg|jpe?g|webp|ico|woff2?|ttf|mp3|ogg|wav)$/i;
/** Fichier → générateur et fragments que ce générateur doit contenir (le chemin écrit, la variante produite). */
const PROVENANCE: Record<string, { generator: string; mentions: string[] }> = {
    'apps/web/public/art/glyphs.svg': { generator: 'packages/renderer-pixi/src/art.ts', mentions: ['art/glyphs.svg', 'export function glyphSheet()'] },
    'apps/web/public/icons/six-de-chaque-192.png': { generator: 'scripts/make-icons.js', mentions: ['apps/web/public/icons/six-de-chaque-${nom}.png', "['192', 192"] },
    'apps/web/public/icons/six-de-chaque-512.png': { generator: 'scripts/make-icons.js', mentions: ['apps/web/public/icons/six-de-chaque-${nom}.png', "['512', 512"] },
    'apps/web/public/icons/six-de-chaque-maskable-512.png': { generator: 'scripts/make-icons.js', mentions: ['apps/web/public/icons/six-de-chaque-${nom}.png', "['maskable-512', 512"] }
};

// Fichiers suivis, plus les fichiers nouveaux non ignorés : une image ajoutée se voit avant même son commit.
const gitFiles = (): string[] => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\0').filter(file => file && existsSync(file));

// Sans dépôt git (copie « git archive » du créneau e2e) : parcours du système de fichiers depuis la racine, hors
// dossiers produits et hors motifs de .gitignore, lu simplement : une ligne = un nom de dossier (« x/ ») ou un
// motif de nom de fichier (« * » pour n'importe quels caractères).
const ALWAYS_SKIPPED = ['node_modules/', 'dist/', '.git/', '.npm-cache/', '.pw-browsers/', 'test-results/', 'playwright-report/'];
const pattern = (glob: string): RegExp => new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
function ignoreRules(): { dirs: RegExp[]; files: RegExp[] } {
    const lines = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8').split('\n') : [];
    const rules = [...ALWAYS_SKIPPED, ...lines].map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.replace(/^\//, ''));
    return { dirs: rules.map(rule => pattern(rule.replace(/\/$/, ''))), files: rules.filter(rule => !rule.endsWith('/')).map(pattern) };
}
function walkedFiles(): string[] {
    const { dirs, files } = ignoreRules();
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir || '.', { withFileTypes: true })) {
            const path = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.isDirectory()) { if (!dirs.some(d => d.test(entry.name))) walk(path); }
            else if (entry.isFile() && !files.some(f => f.test(entry.name))) out.push(path);
        }
    };
    walk('');
    return out;
}
const hasGit = (): boolean => spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' }).status === 0;
const repositoryFiles = (): string[] => hasGit() ? gitFiles() : walkedFiles();

it('without git, walking the file system finds the same images as git', () => {
    const images = (list: string[]): string[] => list.filter(file => ASSET.test(file)).sort();
    const walked = images(walkedFiles());
    expect(walked.length, 'aucune image trouvée par le parcours').toBeGreaterThan(0);
    if (hasGit()) expect(walked).toEqual(images(gitFiles()));
});

it('every image in the repository comes from a generator in the repository', () => {
    const assets = repositoryFiles().filter(file => ASSET.test(file)).sort();
    expect(assets.filter(file => !(file in PROVENANCE)), 'images sans générateur déclaré').toEqual([]);
    for (const [file, { generator, mentions }] of Object.entries(PROVENANCE)) {
        expect(assets, `${file} déclaré mais absent`).toContain(file);
        expect(existsSync(generator), `générateur ${generator} absent`).toBe(true);
        const source = readFileSync(generator, 'utf8');
        for (const fragment of mentions) expect(source, `${generator} ne mentionne pas ${fragment}`).toContain(fragment);
    }
    expect(readFileSync('apps/web/public/art/glyphs.svg', 'utf8')).toBe(glyphSheet());
    const css = readFileSync('apps/web/src/styles.css', 'utf8');
    expect(css).not.toMatch(/@font-face|@import|url\(\s*['"]?(https?:)?\/\//i);
    const html = readFileSync('apps/web/index.html', 'utf8');
    expect(html, 'ressource tierce dans la page').not.toMatch(/(src|href)\s*=\s*["']?(https?:)?\/\//i);
});

/** Décode un PNG 8 bits non entrelacé (RVB ou RVBA) en pixels RVBA (alpha 255 pour un PNG RVB). */
function decodePng(png: Buffer): { width: number; height: number; rgba: Buffer } {
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), depth = png[24], type = png[25], interlace = png[28];
    if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) throw new Error(`PNG non pris en charge : ${depth} bits, type ${type}`);
    const chunks: Buffer[] = [];
    for (let at = 8; at < png.length;) {
        const length = png.readUInt32BE(at), kind = png.toString('latin1', at + 4, at + 8);
        if (kind === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
        at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(chunks)), bpp = type === 6 ? 4 : 3, stride = width * bpp;
    const out = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]!;
        for (let x = 0; x < stride; x++) {
            const v = raw[y * (stride + 1) + 1 + x]!;
            const a = x >= bpp ? out[y * stride + x - bpp]! : 0, b = y > 0 ? out[(y - 1) * stride + x]! : 0, c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
            if (pred === undefined) throw new Error(`filtre PNG inconnu : ${filter}`);
            out[y * stride + x] = (v + pred) & 0xff;
        }
    }
    const rgba = Buffer.alloc(width * height * 4, 0xff);
    for (let i = 0; i < width * height; i++) out.copy(rgba, i * 4, i * bpp, i * bpp + bpp);
    return { width, height, rgba };
}

const ICONS = Object.keys(PROVENANCE).filter(file => file.startsWith('apps/web/public/icons/'));

/** Lance le générateur d'icônes dans `cwd` ; avec `fakeRsvg`, un faux rsvg-convert y recueille le SVG de chaque icône. */
function runIconGenerator(cwd: string, fakeRsvg: boolean): void {
    mkdirSync(cwd, { recursive: true });
    const env = { ...process.env };
    if (fakeRsvg) {
        const bin = join(cwd, '.bin');
        mkdirSync(bin);
        writeFileSync(join(bin, 'rsvg-convert'), '#!/bin/sh\nfor last; do :; done\ncat > "$last.svg"\n');
        chmodSync(join(bin, 'rsvg-convert'), 0o755);
        env.PATH = `${bin}${delimiter}${env.PATH ?? ''}`;
    }
    execFileSync(process.execPath, [resolve('scripts/make-icons.js')], { cwd, env, stdio: 'pipe' });
}

// Points pris DANS la lune (grille 24 × 24 du glyphe), à plus d'une unité de chacun de ses bords : le disque
// extérieur de rayon 9,5 centré vers (13,5 ; 11,9) moins le disque de rayon 8,05 centré en (18 ; 9,75).
const MOON_INSIDE: ReadonlyArray<readonly [number, number]> = [[6, 12], [7, 16], [8, 7]];

// Les icônes suivies sont exactement ce que produit le générateur du dépôt, relancé dans un dossier temporaire.
// Toujours : un faux rsvg-convert recueille le SVG produit, et les pixels du PNG suivi doivent porter ses couleurs,
// alpha compris (sable autour, galet clair hors du glyphe, couleur de la lune dans la lune). Avec rsvg-convert en
// plus : comparaison octet par octet (pixel par pixel, alpha compris, si l'encodage diffère).
it('the tracked icons are what the icon generator in the repository produces', () => {
    const work = mkdtempSync(join(tmpdir(), 'six-icones-'));
    try {
        const fake = join(work, 'faux');
        runIconGenerator(fake, true);
        for (const file of ICONS) {
            const svg = readFileSync(join(fake, `${file}.svg`), 'utf8');
            const sand = /<rect width="100" height="100" fill="(#[0-9A-Fa-f]{6})"\/>/.exec(svg)?.[1];
            const pebble = /<rect x="10" y="10" width="80" height="80" rx="24" fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1];
            const shift = /<g transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)">/.exec(svg);
            const glyph = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"><path d="[^"]+" fill="(#[0-9A-Fa-f]{6})"\/><\/g>/.exec(svg);
            if (!sand || !pebble || !shift || !glyph) throw new Error(`${file} : SVG du générateur illisible`);
            // Peintures sans transparence : un pixel plein vaut la couleur déclarée avec un alpha de FF.
            expect(svg, `${file} : opacité dans le SVG`).not.toMatch(/opacity|rgba|hsla/i);
            const { width, rgba } = decodePng(readFileSync(file));
            const at = (x: number, y: number): string => { const i = (Math.floor(y * width / 100) * width + Math.floor(x * width / 100)) * 4; return `#${[0, 1, 2, 3].map(k => rgba[i + k]!.toString(16).padStart(2, '0')).join('').toUpperCase()}`; };
            const [d, e] = [Number(shift[1]), Number(shift[2])];
            const [gx, gy, gs, moon] = [Number(glyph[1]), Number(glyph[2]), Number(glyph[3]), glyph[4]!];
            // Coin : fond ; (50, 14) du motif : dans le galet, au-dessus du glyphe.
            expect(at(0.5, 0.5), `${file} : fond`).toBe(`${sand.toUpperCase()}FF`);
            expect(at(d + 50 * e, d + 14 * e), `${file} : galet`).toBe(`${pebble.toUpperCase()}FF`);
            for (const [x, y] of MOON_INSIDE) {
                expect(at(d + (gx + x * gs) * e, d + (gy + y * gs) * e), `${file} : lune en (${x}, ${y})`).toBe(`${moon.toUpperCase()}FF`);
            }
        }
        if (spawnSync('rsvg-convert', ['--version']).status !== 0) return;
        const real = join(work, 'vrai');
        runIconGenerator(real, false);
        for (const file of ICONS) {
            const made = readFileSync(join(real, file)), tracked = readFileSync(file);
            if (made.equals(tracked)) continue;
            const a = decodePng(made), b = decodePng(tracked);
            expect([b.width, b.height], `${file} : dimensions`).toEqual([a.width, a.height]);
            expect(b.rgba.equals(a.rgba), `${file} diffère de la sortie du générateur (couleur ou alpha)`).toBe(true);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
