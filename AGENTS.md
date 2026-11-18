# Travailler sur « Six de chaque »

Guide pour tout agent de code (et tout humain) qui modifie ce dépôt. Les contraintes qui suivent font foi ;
la conception détaillée et les plans de travail sont tenus hors de ce dépôt. Outillage repris de capsule-panic.

## Contraintes à respecter

- **Garde de marque** : aucun nom de jeu du commerce ni de son éditeur, aucun nom de travail, aucun identifiant
  de ticket (majuscules, tiret, chiffres) dans les fichiers suivis par git, messages de commit compris
  (`tests/brand-guard.test.ts`). Les tests d'acceptation se nomment `T01`…`T24`.
- **Identité visuelle propre** : galets clairs aux coins très arrondis sur fond de sable ; glyphes lune, goutte,
  feuille, éclair, spirale, cœur ; couleurs Okabe-Ito et un motif par couleur (plein, rayé, pointillé, quadrillé,
  anneau, chevron). Jamais de bloc noir carré, ni rond, croix, losange, carré ou étoile comme jeu de formes.
- **Moteur pur** : `packages/engine/**`, `packages/contracts/**` et `packages/ai/src/**` (sauf `worker.ts`)
  n'utilisent ni `window`, `document`, `navigator`, `self`, `Date`, `localStorage`, `indexedDB`, `fetch`,
  `performance`, `requestAnimationFrame`, ni `Math.random`, et n'importent ni `react`, ni `react-dom`, ni
  `pixi.js` (oxlint, vérifié par `tests/engine-purity.test.ts`). Aucune fonction publique du moteur ne modifie
  son argument ; tout aléa passe par l'état RNG de la partie. Une action rejetée laisse tout identique.
- **Règles** : 108 tuiles = 6 couleurs × 6 formes × 3 copies ; main de 6 ; ligne de 1 à 6 ; +6 pour une ligne
  complétée à six ; +6 au joueur qui vide sa main réserve vide ; échange à 0 point ; coordonnées bornées à
  ±100 000. Passer : sans pose possible, réserve vide ou position morte (aucune tuile hors plateau posable) ;
  en position morte, l'échange reste permis (choix du joueur), l'ordinateur passe.
- **Dépendances d'exécution** : `ajv` (contrats), `pixi.js` (rendu), `react` et `react-dom` (application).
  Rien d'autre sans accord.
- **Licences** : code MIT ; art original CC BY 4.0 ; aucune dépendance GPL, AGPL, LGPL, SSPL ou CC BY-SA
  (`npm run check:licenses`).
- **Aucune télémétrie, aucune requête réseau** à l'exécution hors fichiers de l'application. **Aucun son.**

## Paquets

- `packages/engine` : tuiles, PRNG xoshiro128**, empreintes FNV-1a, création de partie, validation, score,
  transitions, journal chaîné, rejeu, projection publique, générateur de coups légaux.
- `packages/contracts` : schémas JSON de la partie et des actions, validateurs ajv.
- `packages/ai` : politiques débutant et intermédiaire, hôte de Worker annulable, client.
- `packages/renderer-pixi` : art (galets, glyphes, motifs), caméra, vue PixiJS du plateau ; aucune règle.
- `packages/shared` : types non métier.
- `apps/web` : application React (écrans, main, clavier, historique), IndexedDB, PWA ; le build sort dans
  `dist/` à la racine. `?seed=<texte>` dans l'adresse fixe la graine d'une nouvelle partie.

## Tests : ciblés, jamais la suite complète

En local : `npx vitest run <fichier>` seulement (`T17_RUNS=20` par défaut). Playwright : des specs explicites,
après `npm run build`. La CI joue tout.

## Commits

Auteur du dépôt ; message en français terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
Jamais `git add -A` : ajouter par chemins.

## CI

Woodpecker : `.woodpecker/checks.yml` (npm ci, lint, typecheck, test, build avec l'empreinte `empreinte dist`,
check:precache, SBOM, audit, licences, secrets) puis `.woodpecker/e2e.yml` ; `.woodpecker/mutation.yml` à la main.
