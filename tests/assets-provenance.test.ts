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

/** Décode un PNG 8 bits non entrelacé (RVB ou RVBA) en pixels RVB : largeur, hauteur, octets. */
function decodePng(png: Buffer): { width: number; height: number; rgb: Buffer } {
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
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) out.copy(rgb, i * 3, i * bpp, i * bpp + 3);
    return { width, height, rgb };
}

const ICONS = Object.keys(PROVENANCE).filter(file => file.startsWith('apps/web/public/icons/'));

// Les icônes suivies sont exactement ce que produit le générateur du dépôt, relancé dans un dossier temporaire.
// Avec rsvg-convert : comparaison octet par octet (pixel par pixel si l'encodage diffère). Sans lui (image de CI) :
// un faux rsvg-convert recueille le SVG produit, et les pixels du PNG suivi doivent porter ses couleurs de fond
// (sable autour, galet clair hors du glyphe).
it('the tracked icons are what the icon generator in the repository produces', () => {
    const work = mkdtempSync(join(tmpdir(), 'six-icones-'));
    try {
        const real = spawnSync('rsvg-convert', ['--version']).status === 0;
        const env = { ...process.env };
        if (!real) {
            const bin = join(work, 'bin');
            mkdirSync(bin);
            writeFileSync(join(bin, 'rsvg-convert'), '#!/bin/sh\nfor last; do :; done\ncat > "$last.svg"\n');
            chmodSync(join(bin, 'rsvg-convert'), 0o755);
            env.PATH = `${bin}${delimiter}${env.PATH ?? ''}`;
        }
        execFileSync(process.execPath, [resolve('scripts/make-icons.js')], { cwd: work, env, stdio: 'pipe' });
        for (const file of ICONS) {
            const tracked = readFileSync(file);
            if (real) {
                const made = readFileSync(join(work, file));
                if (made.equals(tracked)) continue;
                const a = decodePng(made), b = decodePng(tracked);
                expect([b.width, b.height], `${file} : dimensions`).toEqual([a.width, a.height]);
                expect(b.rgb.equals(a.rgb), `${file} diffère de la sortie du générateur`).toBe(true);
                continue;
            }
            const svg = readFileSync(join(work, `${file}.svg`), 'utf8');
            const sand = /<rect width="100" height="100" fill="(#[0-9A-Fa-f]{6})"\/>/.exec(svg)?.[1];
            const pebble = /<rect x="10" y="10" width="80" height="80" rx="24" fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1];
            const shift = /<g transform="translate\(([\d.]+) [\d.]+\) scale\(([\d.]+)\)">/.exec(svg);
            if (!sand || !pebble || !shift) throw new Error(`${file} : SVG du générateur illisible`);
            const { width, rgb } = decodePng(tracked);
            const at = (x: number, y: number): string => { const i = (Math.floor(y * width / 100) * width + Math.floor(x * width / 100)) * 3; return `#${[0, 1, 2].map(k => rgb[i + k]!.toString(16).padStart(2, '0')).join('').toUpperCase()}`; };
            // Coin : fond ; (50, 14) du motif : dans le galet, au-dessus du glyphe.
            const [d, e] = [Number(shift[1]), Number(shift[2])];
            expect(at(0.5, 0.5), `${file} : fond`).toBe(sand.toUpperCase());
            expect(at(d + 50 * e, d + 14 * e), `${file} : galet`).toBe(pebble.toUpperCase());
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});
