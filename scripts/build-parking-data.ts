// Builds public/data/parking.json from OpenStreetMap + the curated list in data/curated-parking.json.
// Run with: npm run build:data   (Node >= 22.18 runs TypeScript directly)
//
// Environment overrides:
//   OVERPASS_URL   (default https://overpass-api.de/api/interpreter)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { requireArray, requireObject } from '../src/lib/assert.ts';
import { parseLatLng, parseParkingSpot } from '../src/lib/dataset.ts';
import {
  GUSH_DAN_BBOX,
  buildOverpassQuery,
  nearestStation,
  outerRingsFromGeoJson,
  parseOsmElement,
  spotFromOsm,
  stationsFrom,
} from '../src/lib/osmImport.ts';
import { fetchAhuzotLots, spotFromAhuzot, withoutDuplicates } from '../src/lib/telAvivParking.ts';
import type { AvoidZone, ParkingDataset, ParkingSpot, VehicleType } from '../src/lib/types.ts';

const USER_AGENT = 'ParkNGo-data-builder/0.1 (https://github.com/AmitaiMyers/ParkNGo)';
const OVERPASS_URL = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';
const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
const CURATED_PATH = new URL('../data/curated-parking.json', import.meta.url);
const OUTPUT_PATH = new URL('../public/data/parking.json', import.meta.url);

/** Congested areas the user can choose to avoid. `osmRelation` is the OSM administrative boundary. */
const AVOID_ZONE_SOURCES = [{ id: 'tel-aviv-yafo', osmRelation: 1382494, name: { en: 'Tel Aviv-Yafo', he: 'תל אביב-יפו' } }];

/** "Server busy" statuses; Overpass asks clients to retry these with exponential backoff. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
/** Waits before each retry (exponential backoff). After the last one the error is thrown. */
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
    if (response.ok) {
      return response.json();
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (!RETRYABLE_STATUSES.has(response.status) || delay === undefined) {
      throw new Error(`HTTP ${response.status} from ${url}: ${(await response.text()).slice(0, 300)}`);
    }
    console.log(`HTTP ${response.status} from ${url} (server busy) — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000} s`);
    if (response.body !== null) {
      await response.body.cancel(); // release the connection before waiting
    }
    await wait(delay);
  }
}

async function fetchOsmElements() {
  const body = new URLSearchParams({ data: buildOverpassQuery(GUSH_DAN_BBOX) });
  const raw = requireObject(await fetchJson(OVERPASS_URL, { method: 'POST', body }), 'overpass response');
  return requireArray(raw['elements'], 'overpass.elements').map(parseOsmElement);
}

async function fetchAvoidZones(): Promise<AvoidZone[]> {
  const ids = AVOID_ZONE_SOURCES.map((zone) => `R${zone.osmRelation}`).join(',');
  const url = `${NOMINATIM_LOOKUP_URL}?osm_ids=${ids}&format=json&polygon_geojson=1&polygon_threshold=0.0005`;
  const results = requireArray(await fetchJson(url, {}), 'nominatim response').map((r) => requireObject(r, 'nominatim result'));
  return AVOID_ZONE_SOURCES.map((zone) => {
    const match = results.find((r) => r['osm_type'] === 'relation' && r['osm_id'] === zone.osmRelation);
    if (match === undefined) {
      throw new Error(`Nominatim did not return relation ${zone.osmRelation} (${zone.id})`);
    }
    return { id: zone.id, name: zone.name, rings: outerRingsFromGeoJson(match['geojson']) };
  });
}

/** Prints every park-and-ride lot found, so each deploy log shows what was collected. */
function logParkAndRideReport(spots: ParkingSpot[]): void {
  const parkAndRide = spots.filter((spot) => spot.isParkAndRide);
  console.log(`\nPark & ride lots: ${parkAndRide.length}`);
  for (const spot of parkAndRide) {
    const name = spot.name === null ? '(unnamed)' : spot.name;
    const price = spot.price.type === 'paid' ? `paid${spot.price.dailyIls === null ? '' : ` ₪${spot.price.dailyIls}/day`}` : spot.price.type;
    const where = `${spot.location.lat.toFixed(5)},${spot.location.lng.toFixed(5)}`;
    const capacity = spot.capacity === null ? '' : ` cap=${spot.capacity}`;
    console.log(`  ${spot.id} | ${name} | ${where} | ${price}${capacity} | ${spot.nearestStation.distanceMeters} m to ${spot.nearestStation.name}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const [elements, avoidZones, curatedText, ahuzotLots] = await Promise.all([
    fetchOsmElements(),
    fetchAvoidZones(),
    readFile(CURATED_PATH, 'utf8'),
    fetchAhuzotLots(),
  ]);
  const stations = stationsFrom(elements);
  console.log(`OSM: ${elements.length} elements, ${stations.length} named stations`);

  const ahuzotSpots = ahuzotLots.map((lot) => spotFromAhuzot(lot, stations)).filter((spot): spot is ParkingSpot => spot !== null);
  const allOsmSpots = elements.map((element) => spotFromOsm(element, stations)).filter((spot): spot is ParkingSpot => spot !== null);
  const osmSpots = withoutDuplicates(allOsmSpots, ahuzotSpots);
  console.log(`Tel Aviv municipal lots: ${ahuzotLots.length} (${ahuzotSpots.length} near transit); dropped ${allOsmSpots.length - osmSpots.length} OSM duplicates`);

  // Curated spots omit nearestStation; it is computed here, then the whole record is validated.
  const curatedSpots = requireArray(JSON.parse(curatedText), 'curated-parking.json').map((raw) => {
    const record = requireObject(raw, 'curated spot');
    const location = parseLatLng(record['location'], 'curated spot location');
    return parseParkingSpot({ ...record, nearestStation: nearestStation(location, stations) });
  });

  const dataset: ParkingDataset = {
    generatedAt: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors (ODbL) + Tel Aviv-Yafo Municipality GIS + ParkNGo curated list',
    spots: [...curatedSpots, ...ahuzotSpots, ...osmSpots],
    avoidZones,
  };
  await mkdir(new URL('.', OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset)}\n`);
  const byVehicle = (vehicle: VehicleType) => dataset.spots.filter((spot) => spot.vehicleTypes.includes(vehicle)).length;
  logParkAndRideReport(dataset.spots);
  console.log(`Wrote ${dataset.spots.length} spots (${curatedSpots.length} curated; car ${byVehicle('car')}, bicycle ${byVehicle('bicycle')}) and ${avoidZones.length} avoid zones`);
}

await main();
