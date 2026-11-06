import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at https://amitaimyers.github.io/ParkNGo/
const BASE_PATH = '/ParkNGo/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'ParkNGo – Park & Ride planner',
        short_name: 'ParkNGo',
        description: 'Drive or ride to free parking outside the traffic, then continue by public transport.',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts: precache only the Hebrew and Latin subsets the UI uses (others download on demand).
        globPatterns: ['**/*.{js,css,html,svg,png,json}', '**/rubik-{hebrew,latin,latin-ext}-wght-normal-*.woff2'],
        runtimeCaching: [
          {
            // Vector tiles: cache-first, a week, bounded.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            // Map styles, fonts and sprites: fast from cache, refreshed in the background.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles|fonts|sprites)\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-style', expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  worker: {
    // MapLibre starts its worker as a module worker.
    format: 'es',
  },
  build: {
    // The lazy MapLibre chunk (~1.07 MB, ~290 KB gzip) is expected; it loads after first paint.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
