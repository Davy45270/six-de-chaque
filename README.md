# Six de chaque

Jeu de tuiles hors ligne, de 2 à 4 joueurs (humains ou ordinateur) : aligne des galets de même couleur aux
glyphes tous différents, ou de même glyphe aux couleurs toutes différentes. Six couleurs, six glyphes, trois
exemplaires de chaque : 108 galets. Une ligne complétée à six rapporte six points de bonus.

PWA installable, jouable sans réseau, sans compte ni télémétrie. Sauvegarde automatique après chaque coup,
reprise, export et import de la partie, rejeu pas à pas une fois la partie finie.

## Commandes

```
npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

## Licences

- Code : MIT (`LICENSE`).
- Art original (galets, glyphes lune, goutte, feuille, éclair, spirale, cœur, motifs et icônes) : CC BY 4.0,
  David Sevin. Dessiné pour ce jeu, aucun emprunt.

## Règles tranchées

- Premier joueur : la main au plus grand groupe compatible ; égalité départagée par la graine de la partie.
- Le premier coup est une pose. Passer n'est permis que sans pose possible et, s'il reste des tuiles en
  réserve, seulement en **position morte** (plus aucune tuile hors du plateau n'y trouve de place) : sans cela,
  deux joueurs bloqués échangeraient sans fin. En position morte, le joueur **choisit** : passer, ou échanger
  tout ou partie de sa main contre des tuiles tirées au hasard dans la réserve. Un échange remet le compte des
  passes à zéro ; un tour complet de passes termine la partie, sans bonus. L'ordinateur, lui, passe en position
  morte : aucun échange ne peut alors lui rendre une tuile posable, puisque la réserve n'en contient aucune.
- Égalité au plus haut score : victoire partagée.

## Politiques de l’ordinateur

- **Débutant** privilégie légèrement les poses qui marquent davantage et échange seulement lorsqu’il ne peut pas poser.
- **Intermédiaire** privilégie le score immédiat et retranche quatre points par ligne de cinq ouverte.
- **Avancé** tient aussi compte de la main restante. Il ajoute 0,35 point par couleur ou glyphe distinct conservé
  et 0,2 point par case encore jouable avec cette main.
- **Expert** compare les meilleurs coups de l’Avancé sur des répartitions plausibles des tuiles cachées. Il simule
  une réponse adverse par répartition, avec un budget en nœuds. La même vue et le même budget donnent la même décision.

L’écran de configuration propose les quatre niveaux.
Les niveaux intermédiaire, avancé et expert peuvent échanger en cours de partie si le meilleur placement
rapporte au plus deux points, si la main contient au plus deux combinaisons de couleur et de glyphe et si
la réserve couvre l’échange.

## Sauvegardes

Le moteur et l’export écrivent des instantanés v2. Ceux-ci incluent le nombre de passes consécutives,
la configuration des règles, le motif de fin et le niveau de chaque ordinateur. L’import et la reprise
acceptent les sauvegardes v1 strictes et étendues. La migration vérifie les empreintes historiques,
rejoue les actions et écrit en une transaction l’instantané v2 et son journal recalculé. Un journal
incohérent est refusé avant toute écriture.

## Mesures

`tests/validate-bench.test.ts` affiche le modèle de processeur et la médiane de 15 séries de 1 000 validations
sur des plateaux synthétiques de 108 et 200 tuiles. `packages/ai/test/bench.test.ts` affiche la médiane de neuf
décisions et les nœuds évalués pour chaque niveau sur trois positions de référence.

## Défis

Le bouton « Défis » de l’accueil ouvre la campagne par palier. Chaque essai indique l’objectif et le nombre
de tours disponibles. L’écran de résultat permet de réessayer et de revoir une solution, pose par pose.
La progression et les réglages « Contraste élevé » et « Mode daltonien » sont enregistrés dans IndexedDB.
Le mode daltonien ajoute l’initiale de la couleur à côté du glyphe et du motif.

`@six-de-chaque/puzzles` extrait le plateau et la main courante d’une partie jouée par l’ordinateur et
vérifiée par rejeu. Un défi enchaîne les poses d’un seul joueur à partir de zéro point, jusqu’à la limite
de tours. Le moteur attribue les points de pose et le bonus de fin quand la main et la pioche sont vides.
Avec `drawPolicy: "none"`, la pioche est vide. Avec `"ordered"`, le moteur tire dans l’ordre de `drawOrder`.

`solve(puzzle, budgetNodes)` compte la racine et chaque état atteint par une séquence de poses. Les copies
identiques d’un galet sont équivalentes, comme dans le générateur du moteur. Une séquence qui atteint
l’objectif compte comme solution, et la recherche continue pour trouver les prolongements gagnants.
Le meilleur score départage les solutions, puis l’ordre lexicographique du JSON canonique des poses
(classement des tuiles posées par coordonnées). Son empreinte utilise la solution entière, score inclus.
Un résultat `unknown` signale un budget épuisé et laisse la solvabilité indéterminée, même si des solutions
ont déjà été trouvées. Seule une recherche exhaustive peut conclure `unsolvable` ou prouver l’unicité.

`generate(seed, options)` fixe l’objectif au meilleur score trouvé après exploration exhaustive et rejette
tout candidat gagnable en posant une seule tuile ou ayant plus de huit solutions. Le budget par défaut est
de 12 000 nœuds par position. Les paliers utilisent le plafond du nombre de nœuds divisé par le nombre
de solutions. Les deux seuils sont 50 et 400. Le statut inscrit au reçu vient du solveur.

`npm run puzzles:generate` régénère les douze défis et leur reçu dans `packages/puzzles/data/`.
`npm run puzzles:validate` vérifie les invariants et rejoue les solutions de référence avec le moteur.
Les tests ciblés revérifient aussi l’exhaustivité, les paliers et les empreintes du reçu.


## Parties d’exemple

Ajoute l’un des paramètres suivants à l’URL de l’application. Les exemples sont jouables en mémoire. La reprise
de la partie sauvegardée reste disponible depuis l’accueil.

| Paramètre | Écran d’ouverture |
| --- | --- |
| `?exemple=deux-humains` | Passe l’appareil |
| `?exemple=position-morte` | Position morte, « Passer » ou « Échanger » |
| `?exemple=fin` | Partie terminée par blocage |
| `?exemple=fin-main-vide` | Partie terminée avec le bonus de 6 points |
| `?exemple=echange` | Choix des galets à échanger |

`npm run examples:generate` régénère `apps/web/data/exemples.json` depuis les graines et les coups.
La compilation rejoue ces données et embarque les positions, leur journal et leur écran d’ouverture.
Avec `?seed=clavier` et les joueurs proposés par défaut, l’humain commence la partie.
