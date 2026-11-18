// Repris d'echecs-kid (scripts/check-precache.js).
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Inspecte le manifeste généré, après le build de production.
const root = new URL('../dist/', import.meta.url);
const worker = readFileSync(new URL('sw.js', root), 'utf8');
const entries = [...worker.matchAll(/\burl:\s*"([^"]+)"/g)].map(match => match[1]);
assert(entries.length > 3, 'Precache manifest is incomplete');
const urls = [...new Set(entries)];
assert(urls.includes('index.html'), 'Missing precached entry point');
assert(urls.some(url => /^assets\/.*\.js$/.test(url)), 'Missing precached JavaScript');
let compressed = 0;
for (const url of urls) {
    assert(!/^(?:[a-z]+:|\/)|\.\./i.test(url), `Nonlocal precache asset: ${url}`);
    compressed += gzipSync(readFileSync(new URL(url, root)), { level: 9 }).byteLength;
}
// Budget du précache : 800 kB gzip, comme Opencadkid.
assert(compressed < 800_000, `Precache exceeds 800 kB gzip: ${compressed} bytes`);
