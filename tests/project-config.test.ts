import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import pkg from '../package.json';
import lock from '../package-lock.json';
import tsconfig from '../tsconfig.json';
import vitest from '../vitest.config';
import playwright from '../playwright.config';

const workspaces = ['apps/web', ...['engine', 'ai', 'puzzles', 'renderer-pixi', 'contracts', 'shared'].map(name => `packages/${name}`)];
const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { type: string; dependencies?: Record<string, string> };
const checks = readFileSync('.woodpecker/checks.yml', 'utf8');
const e2e = readFileSync('.woodpecker/e2e.yml', 'utf8');

it('typescript is strict', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
});

it('packages are ESM', () => {
    expect(pkg.type).toBe('module');
    for (const dir of workspaces) expect(manifest(dir).type, dir).toBe('module');
});

it('stack is React, Vite, PixiJS, Vitest and Playwright', () => {
    expect(manifest('apps/web').dependencies).toHaveProperty('react');
    expect(manifest('packages/renderer-pixi').dependencies).toHaveProperty('pixi.js');
    for (const tool of ['vite', 'vitest', '@playwright/test']) expect(pkg.devDependencies).toHaveProperty(tool);
});

it('monorepo has apps/web, engine, ai, puzzles, renderer-pixi, contracts and shared', () => {
    for (const dir of workspaces) {
        expect(pkg.workspaces).toContain(dir.replace(/[^/]+$/, '*'));
        expect(lock.packages).toHaveProperty([dir]);
        expect(existsSync(join(dir, 'package.json'))).toBe(true);
    }
});

it('target commands install, lint, typecheck, test, build and e2e exist', () => {
    expect(execFileSync('npm', ['install', '--help'], { encoding: 'utf8' })).toMatch(/npm install\b/);
    for (const script of ['lint', 'typecheck', 'test', 'build', 'e2e', 'test:e2e']) expect(pkg.scripts).toHaveProperty(script, expect.any(String));
});

it('CI installs from the frozen lockfile and runs lint, typecheck, test, build, e2e and package in that order', () => {
    expect(lock.lockfileVersion).toBeGreaterThan(0);
    expect(e2e).toMatch(/^depends_on:\s*\[checks\]/m);
    const workflow = checks + e2e;
    const commands = [/^\s*- npm ci$/m, /npm run lint\b/, /npm run typecheck\b/, /npm test\b/, /npm run build\b/, /npm run (?:test:)?e2e\b/, /npm run package\b/];
    let previous = -1;
    for (const command of commands) {
        const index = workflow.search(command);
        expect(index, command.source).toBeGreaterThan(previous);
        previous = index;
    }
    expect(e2e).toMatch(/^ {2}- name: package$/m);
});

it('CI produces an SBOM, audits dependencies, scans secrets and checks licences', () => {
    for (const command of ['npm sbom --sbom-format cyclonedx > sbom.json', 'npm audit', 'gitleaks detect', 'npm run check:licenses']) {
        expect(checks).toContain(command);
    }
});

it('playwright runs Chromium, Firefox and WebKit mobile projects', () => {
    for (const engine of ['chromium', 'firefox', 'webkit']) {
        const mobile = playwright.projects?.find(project => project.name === `${engine}-mobile`)?.use;
        const deviceEngine = mobile && 'defaultBrowserType' in mobile ? mobile.defaultBrowserType : undefined;
        expect(mobile?.browserName ?? deviceEngine).toBe(engine);
        expect(mobile?.hasTouch).toBe(true);
    }
});

it('coverage threshold is at least 95 percent of branches on rules and score', () => {
    const coverage = vitest.test?.coverage;
    expect(coverage?.thresholds?.branches).toBeGreaterThanOrEqual(95);
    for (const file of ['placement', 'validate', 'lines', 'apply', 'score']) {
        expect(coverage?.include).toContain(`packages/engine/src/${file}.ts`);
    }
});

it('licences: code MIT and original art CC BY 4.0 are declared', () => {
    expect(pkg.license).toBe('MIT');
    expect(readFileSync('LICENSE', 'utf8')).toMatch(/MIT License\s+Copyright[^\n]*David Sevin/);
    expect(readFileSync('README.md', 'utf8')).toMatch(/Art original[^\n]*CC BY 4\.0,\s+David Sevin/);
});

it('package is reproducible', () => {
    const script = resolve('scripts/package.js');
    const root = mkdtempSync(join(tmpdir(), 'six-package-'));
    try {
        mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
        mkdirSync(join(root, 'coverage'));
        const files = {
            'package.json': JSON.stringify({ version: pkg.version }),
            'dist/index.html': '<!doctype html>',
            'dist/assets/image.txt': 'galets',
            'coverage/coverage-summary.json': '{"total":{"branches":{"pct":98}}}',
            'sbom.json': '{"bomFormat":"CycloneDX"}'
        };
        for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
        const run = () => execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const archive = `six-de-chaque-${pkg.version}.tar.gz`;
        const release = (file: string) => readFileSync(join(root, 'release', file));
        const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
        const firstLog = run();
        const firstHash = hash(release(archive));
        const sums = `${firstHash}  ${archive}\n${hash(files['dist/assets/image.txt'])}  dist/assets/image.txt\n${hash(files['dist/index.html'])}  dist/index.html\n`;
        expect(release('SHA256SUMS').toString()).toBe(sums);
        expect(firstLog).toContain(sums);
        expect(firstLog).toContain(files['coverage/coverage-summary.json']);
        expect(release('coverage-summary.json').toString()).toBe(files['coverage/coverage-summary.json']);
        expect(release('sbom.json').toString()).toBe(files['sbom.json']);
        expect(execFileSync('tar', ['-tzf', join(root, 'release', archive)], { encoding: 'utf8' }).trim().split('\n'))
            .toEqual(['dist/', 'dist/assets/', 'dist/assets/image.txt', 'dist/index.html']);
        for (const path of ['dist', 'dist/assets', 'dist/assets/image.txt', 'dist/index.html']) {
            utimesSync(join(root, path), 1_700_000_000, 1_700_000_000);
        }
        expect(run()).toBe(firstLog);
        expect(hash(release(archive))).toBe(firstHash);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
