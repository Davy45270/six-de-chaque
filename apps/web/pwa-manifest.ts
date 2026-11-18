// Repris de capsule-panic (apps/web/pwa-manifest.ts).
import type { ManifestOptions } from 'vite-plugin-pwa';
export const manifest: Partial<ManifestOptions> = {
    name: 'Six de chaque',
    short_name: 'Six de chaque',
    description: 'Aligne des galets de même couleur ou de même glyphe, sans jamais deux fois le même : six de chaque.',
    lang: 'fr',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#E9DCC0',
    background_color: '#E9DCC0',
    start_url: './',
    scope: './',
    icons: [
        { src: 'icons/six-de-chaque-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/six-de-chaque-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/six-de-chaque-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
};
