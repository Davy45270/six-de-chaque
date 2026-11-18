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
  deux joueurs bloqués échangeraient sans fin. Un tour complet de passes termine la partie, sans bonus.
- Égalité au plus haut score : victoire partagée.

## Mesure

Validation d'un coup sur un plateau synthétique de 108 tuiles (`tests/validate-bench.test.ts`) : environ
9 µs par coup (médiane de 15 passes de 1 000 coups), mesuré le 18 novembre 2026 sur un Intel Xeon E5-2680 v2 à
2,8 GHz, Node 26. Ce chiffre ne vaut que pour ce matériel.
