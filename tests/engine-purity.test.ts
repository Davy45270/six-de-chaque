// Repris de capsule-panic (tests/engine-purity.test.ts), étendu au paquet de l'ordinateur.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';

const lint = (probe: string): string => {
    try {
        execFileSync('npx', ['oxlint', '--max-warnings=0', probe], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return '';
    } catch (error) {
        const { stdout, stderr } = error as { stdout: string; stderr: string };
        return stdout + stderr || 'failed';
    }
};
// The pure packages must not reach the clock, the DOM, randomness or the UI libraries: oxlint enforces it.
it.each(['packages/engine/src', 'packages/ai/src', 'packages/contracts/src'])('engine purity is enforced by lint in %s', folder => {
    const probe = `${folder}/__lint_probe.ts`;
    writeFileSync(probe, "import 'react';\nexport const a = Math.random();\nexport const b = new Date();\nexport const c = indexedDB;\n");
    try {
        const output = lint(probe);
        expect(output).toContain('no-restricted-imports');
        expect(output).toContain('no-restricted-properties');
        expect(output).toContain('no-restricted-globals');
    } finally { rmSync(probe, { force: true }); }
}, 60_000);
