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

Le moteur permet de configurer les quatre niveaux. L’écran de configuration propose débutant et intermédiaire.
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
