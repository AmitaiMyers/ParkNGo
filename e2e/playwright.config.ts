import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// End-to-end tests against the production build (`npm run build` first). All network is mocked
// (see mocks.ts), so the suite is deterministic and runs offline.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
  use: {
    baseURL: 'http://localhost:4173/ParkNGo/',
    trace: 'off',
    locale: 'en-US',
    timezoneId: 'Asia/Jerusalem',
    geolocation: { latitude: 32.1848, longitude: 34.8713 },
    permissions: ['geolocation'],
    // The PWA service worker would bypass page.route() mocks.
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://localhost:4173/ParkNGo/',
    reuseExistingServer: process.env['CI'] === undefined,
  },
});
