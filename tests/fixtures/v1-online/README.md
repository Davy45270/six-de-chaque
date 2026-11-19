# Sauvegardes v1 de la version publiée

Produites par le code du commit `4c69be5` (format de sauvegarde v1) : moteur, ordinateur,
`apps/web/src/storage/db.ts` et `transfer.ts` de cet arbre, sur fake-indexeddb. Aucun fichier n'est retouché.

- `*.export.json` : chaîne rendue par `exportGame` v1, écrite telle quelle.
- `*.indexeddb.json` : contenu brut des stores `games`, `events` et `settings` de la base v1
  (`settings` en paires clé, valeur). La v1 n'écrit ni `completedChallenges` ni `colourBlind`.

Régénération, depuis la racine du dépôt, avec un arbre de `4c69be5` dont les dépendances sont installées :

```sh
git worktree add ../six-de-chaque-v1 4c69be5 && (cd ../six-de-chaque-v1 && npm ci)
V1_ROOT=$PWD/../six-de-chaque-v1 node --input-type=module -e "import { createServer, createServerModuleRunner } from 'vite'; const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } }); try { const runner = createServerModuleRunner(server.environments.ssr, { hmr: false }); await (await runner.import('/scripts/make-v1-saves.ts')).main(); } finally { await server.close(); }"
```

La génération est déterministe : les empreintes ci-dessous doivent revenir à l'identique.
`apps/web/test/online-v1-saves.test.ts` les vérifie avant usage.

```text
6ff8e6026afd6ee4ca3a5b74d14b6d566af9ae742eaab23538074bd4f85aec28  accented-names.export.json
0c39050e1b0374806bc382a0e40d557537a639254ba80093a15fa85558b9cc93  accented-names.indexeddb.json
c3e49bd661a0250a6c3efdb815c528feb92eee783b221fc9130589f6d3a3bf40  finished.export.json
fb7dfd2ed387d505e68b3ba45582ceb71c3d8d1ffcfd18147d469913e57abd48  finished.indexeddb.json
5e0b1ce942b4ab52d1da17518d09e75707a539ff91213aca2dd8efa6a6f0667c  four-players-exchanges-passes.export.json
ece2cb48a4c34fdd40d54f155ff3b35607cba614368c41f6bdcc848138207ee0  four-players-exchanges-passes.indexeddb.json
823e807b92a96f201fb8c2dfb74990836c4e74b8cbb5a9145fb64aadb4a129e8  two-players-in-progress.export.json
72352e46a19840b73b76047c7eca2700fe8b0f67b747832e19d9133eb3accb05  two-players-in-progress.indexeddb.json
```
