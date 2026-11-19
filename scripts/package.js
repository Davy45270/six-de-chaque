import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function distFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return distFiles(path);
        if (entry.isFile()) return [path];
        throw new Error(`Entrée inattendue dans le build : ${path}`);
    });
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const archive = `six-de-chaque-${version}.tar.gz`;
const summaryPath = 'coverage/coverage-summary.json';
const summary = readFileSync(summaryPath);
const sbom = readFileSync('sbom.json');
const files = distFiles('dist').sort();
mkdirSync('release', { recursive: true });

execFileSync('tar', [
    '--create', '--use-compress-program=gzip -n', '--file', join('release', archive),
    '--sort=name', '--format=gnu', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '--mode=u=rwX,go=rX', '--', 'dist'
], { env: { ...process.env, LC_ALL: 'C' }, stdio: 'inherit' });

const checksum = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sums = [
    `${checksum(join('release', archive))}  ${archive}`,
    ...files.map(path => `${checksum(path)}  ${path}`)
].join('\n') + '\n';
writeFileSync('release/SHA256SUMS', sums);
writeFileSync('release/coverage-summary.json', summary);
writeFileSync('release/sbom.json', sbom);
process.stdout.write(sums + summary.toString().trimEnd() + '\n');
