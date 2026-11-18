// Icônes PWA : un galet clair portant une lune orange, sur fond de sable. À lancer à la main
// (outil de création, pas de la CI) : node scripts/make-icons.js   (nécessite rsvg-convert)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const motif = '<rect x="10" y="10" width="80" height="80" rx="24" fill="#FBF6EA" stroke="#B9A57E" stroke-width="3"/>'
    + '<g transform="translate(20 20) scale(2.5)"><path d="M14.5 2.5A9.5 9.5 0 1 0 21.5 17A7.5 7.5 0 1 1 14.5 2.5Z" fill="#D55E00"/></g>';
// `marge` : part du côté laissée vide (la version « maskable » garde le motif dans la zone sûre de 80 %).
const icone = (marge) => {
    const echelle = 1 - 2 * marge;
    const decalage = (100 - 100 * echelle) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#E9DCC0"/>`
        + `<g transform="translate(${decalage} ${decalage}) scale(${echelle})">${motif}</g></svg>`;
};
mkdirSync('apps/web/public/icons', { recursive: true });
for (const [nom, taille, marge] of [['192', 192, 0.02], ['512', 512, 0.02], ['maskable-512', 512, 0.12]]) {
    execFileSync('rsvg-convert', ['-w', String(taille), '-h', String(taille), '-o', `apps/web/public/icons/six-de-chaque-${nom}.png`], { input: icone(marge) });
}
