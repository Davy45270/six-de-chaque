// Provenance des images et des sons : chaque fichier binaire ou image du dépôt sort d'un générateur du dépôt.
// Aucune police externe, aucune ressource tierce dans la page.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
const repositoryFiles = (): string[] => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0').filter(file => file && existsSync(file));

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
