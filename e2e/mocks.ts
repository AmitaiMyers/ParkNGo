import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Sunday 07:55 in Israel — just before the recorded itineraries depart. */
export const FIXED_NOW = new Date('2026-11-08T05:55:00Z');

/** Minimal map style: a plain background, so tests never depend on the tile service. */
const MAP_STYLE = JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9eef0' } }] });

const json = (body: string) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });

export async function mockNetwork(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.route('**/data/parking.json', (route) => route.fulfill(json(fixture('parking.json'))));
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.request().url().includes('/styles/') ? route.fulfill(json(MAP_STYLE)) : route.fulfill({ status: 404, body: '' }),
  );
  await page.route('https://gisn.tel-aviv.gov.il/**', (route) => route.fulfill(json(fixture('ahuzot-status.json'))));
  await page.route('https://api.transitous.org/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/geocode') {
      return route.fulfill(json(fixture('geocode-azrieli.json')));
    }
    if (url.pathname === '/api/v1/one-to-many') {
      const count = url.searchParams.get('many')!.split(',').length;
      return route.fulfill(json(JSON.stringify(Array.from({ length: count }, () => ({ duration: 900 })))));
    }
    if (url.pathname === '/api/v6/plan') {
      // Street-only requests send an empty transitModes; everything else is a transit search.
      return route.fulfill(json(fixture(url.searchParams.get('transitModes') === '' ? 'plan-drive.json' : 'plan-transit.json')));
    }
    throw new Error(`Unmocked Transitous request: ${url.pathname}`);
  });
}
