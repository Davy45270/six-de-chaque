// Repris de capsule-panic (apps/web/vite.config.ts), racine dans apps/web et build dans dist/ à la racine du dépôt.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa-manifest.ts';

export default defineConfig({
    base: './',
    worker: { format: 'es' },
    build: { outDir: '../../dist', emptyOutDir: true },
    plugins: [react(), VitePWA({
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
