// Repris de capsule-panic (apps/web/vite.config.ts), racine dans apps/web et build dans dist/ à la racine du dépôt.
import { fileURLToPath } from 'node:url';
import { defineConfig, runnerImport } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa-manifest.ts';
import data from './data/exemples.json' with { type: 'json' };
import type { ExampleData } from './src/game/examples.ts';

function embeddedExamples(): Plugin {
    const id = 'virtual:examples';
    return {
        name: 'embedded-examples',
        resolveId(source) { return source === id ? '\0' + id : undefined; },
        async load(source) {
            if (source !== '\0' + id) return undefined;
            const root = fileURLToPath(new URL('../..', import.meta.url));
            const { module } = await runnerImport<typeof import('./src/game/examples.ts')>('/apps/web/src/game/examples.ts', { root, configFile: false });
            const entries = Object.keys(data.examples).map(key => [key, module.replayExample(key, data as ExampleData)]);
            return `export default ${JSON.stringify(Object.fromEntries(entries))};`;
        }
    };
}

export default defineConfig({
    base: './',
    worker: { format: 'es' },
    build: { outDir: '../../dist', emptyOutDir: true },
    plugins: [embeddedExamples(), react(), VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        manifest,
        workbox: {
            cacheId: 'six-de-chaque',
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{html,js,css,png,svg,webmanifest}']
        }
    })]
});
