// Refuse toute licence à réciprocité forte dans l'arbre des dépendances (package-lock.json).
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const refused = /\b(?:A?GPL|LGPL|SSPL|CC-BY-SA)\b/i;
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.includes('node_modules/'));
const bad = entries.filter(([, info]) => typeof info.license === 'string' && refused.test(info.license)).map(([path, info]) => `${path} : ${info.license}`);
if (bad.length) { process.stderr.write('Licences refusées :\n' + bad.join('\n') + '\n'); process.exit(1); }
process.stdout.write(`Licences : ${entries.length} paquets contrôlés, aucune refusée.\n`);
