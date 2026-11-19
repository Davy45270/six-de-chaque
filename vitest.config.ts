// Repris de capsule-panic (vitest.config.ts) ; un projet par dossier de tests.
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['tests/*.test.ts', 'packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        pool: 'threads',
        maxWorkers: 2,
        testTimeout: 30_000,
        // Seuil de la spec : 95 % des branches sur les règles et le score du moteur.
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
            include: ['packages/engine/src/validate.ts', 'packages/engine/src/placement.ts', 'packages/engine/src/score.ts', 'packages/engine/src/apply.ts', 'packages/engine/src/lines.ts'],
            thresholds: { branches: 95 }
        }
    }
});
