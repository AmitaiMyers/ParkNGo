// Builds public/data/parking.json from OpenStreetMap + the curated list in data/curated-parking.json.
// Run with: npm run build:data   (Node >= 22.18 runs TypeScript directly)
//
// Environment overrides:
//   OVERPASS_URL   (default https://overpass-api.de/api/interpreter)

import { readFile, writeFile } from 'node:fs/promises';
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
import type { AvoidZone, ParkingDataset, ParkingSpot, VehicleType } from '../src/lib/types.ts';

const USER_AGENT = 'ParkNGo-data-builder/0.1 (https://github.com/AmitaiMyers/ParkNGo)';
const OVERPASS_URL = process.env['OVERPASS_URL'] ?? 'https://overpass-api.de/api/interpreter';
const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
const CURATED_PATH = new URL('../data/curated-parking.json', import.meta.url);
const OUTPUT_PATH = new URL('../public/data/parking.json', import.meta.url);

/** Congested areas the user can choose to avoid. `osmRelation` is the OSM administrative boundary. */
const AVOID_ZONE_SOURCES = [{ id: 'tel-aviv-yafo', osmRelation: 1382494, name: { en: 'Tel Aviv-Yafo', he: 'תל אביב-יפו' } }];

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
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

async function main(): Promise<void> {
  const [elements, avoidZones, curatedText] = await Promise.all([fetchOsmElements(), fetchAvoidZones(), readFile(CURATED_PATH, 'utf8')]);
  const stations = stationsFrom(elements);
  console.log(`OSM: ${elements.length} elements, ${stations.length} named stations`);

  const osmSpots = elements.map((element) => spotFromOsm(element, stations)).filter((spot): spot is ParkingSpot => spot !== null);

  // Curated spots omit nearestStation; it is computed here, then the whole record is validated.
  const curatedSpots = requireArray(JSON.parse(curatedText), 'curated-parking.json').map((raw) => {
    const record = requireObject(raw, 'curated spot');
    const location = parseLatLng(record['location'], 'curated spot location');
    return parseParkingSpot({ ...record, nearestStation: nearestStation(location, stations) });
  });

  const dataset: ParkingDataset = {
    generatedAt: new Date().toISOString(),
    attribution: '© OpenStreetMap contributors (ODbL) + ParkNGo curated list',
    spots: [...curatedSpots, ...osmSpots],
    avoidZones,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset)}\n`);
  const byVehicle = (vehicle: VehicleType) => dataset.spots.filter((spot) => spot.vehicleTypes.includes(vehicle)).length;
  console.log(`Wrote ${dataset.spots.length} spots (${curatedSpots.length} curated; car ${byVehicle('car')}, bicycle ${byVehicle('bicycle')}) and ${avoidZones.length} avoid zones`);
}

await main();
