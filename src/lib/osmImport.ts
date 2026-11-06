// Pure functions that turn OpenStreetMap (Overpass) data into ParkingSpots.
// Used by scripts/build-parking-data.ts; kept here so they can be unit-tested.

import { assert, requireNumber, requireObject, requireString } from './assert.ts';
import { haversineMeters } from './geo.ts';
import type { LatLng, NearestStation, ParkingPrice, ParkingSpot, VehicleType } from './types.ts';

/** Gush Dan bounding box: south, west, north, east. */
export const GUSH_DAN_BBOX = { south: 31.9, west: 34.7, north: 32.25, east: 35.0 } as const;
/** Spots farther than this from any rapid-transit station are not useful for park & ride. */
export const MAX_STATION_DISTANCE_METERS = 1500;
/** Access values that make a lot unusable for the public. */
const RESTRICTED_ACCESS = new Set(['private', 'no', 'customers', 'permit', 'residents', 'delivery', 'employees']);

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  location: LatLng;
  tags: Record<string, string>;
}

export interface Station {
  name: string;
  location: LatLng;
}

export function buildOverpassQuery(bbox: typeof GUSH_DAN_BBOX): string {
  const b = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  return `[out:json][timeout:180];
(
  nwr["amenity"="parking"]${b};
  nwr["amenity"="bicycle_parking"]${b};
)->.parking;
(
  nwr["railway"="station"]${b};
  node["railway"="tram_stop"]${b};
  nwr["amenity"="bus_station"]${b};
)->.stations;
.parking out center tags;
.stations out center tags;`;
}

/** Parses one raw Overpass element (`out center tags`): nodes have lat/lon, ways/relations have center. */
export function parseOsmElement(raw: unknown): OsmElement {
  const element = requireObject(raw, 'osm element');
  const type = requireString(element['type'], 'osm.type');
  assert(type === 'node' || type === 'way' || type === 'relation', `Unexpected OSM element type ${type}`);
  const id = requireNumber(element['id'], 'osm.id');
  const position = type === 'node' ? element : requireObject(element['center'], `osm ${type}/${id}.center`);
  const tags = requireObject(element['tags'], `osm ${type}/${id}.tags`);
  return {
    type,
    id,
    location: { lat: requireNumber(position['lat'], 'osm.lat'), lng: requireNumber(position['lon'], 'osm.lon') },
    tags: Object.fromEntries(Object.entries(tags).map(([key, value]) => [key, requireString(value, `osm tag ${key}`)])),
  };
}

const isParking = (element: OsmElement): boolean => element.tags['amenity'] === 'parking' || element.tags['amenity'] === 'bicycle_parking';

export function stationsFrom(elements: OsmElement[]): Station[] {
  return elements
    .filter((element) => !isParking(element) && element.tags['name'] !== undefined)
    .map((element) => ({ name: element.tags['name']!, location: element.location }));
}

export function nearestStation(point: LatLng, stations: Station[]): NearestStation {
  assert(stations.length > 0, 'nearestStation needs at least one station');
  let best: NearestStation | null = null;
  for (const station of stations) {
    const distanceMeters = haversineMeters(point, station.location);
    if (best === null || distanceMeters < best.distanceMeters) {
      best = { name: station.name, distanceMeters: Math.round(distanceMeters), location: station.location };
    }
  }
  return best!;
}

/**
 * OSM `fee` tag → price. Assumption: bicycle racks without a fee tag are free
 * (true for almost all racks); car lots without a fee tag are "unknown".
 */
export function priceFromTags(tags: Record<string, string>): { price: ParkingPrice; note: string | null } {
  const fee = tags['fee'];
  if (fee === undefined) {
    return { price: tags['amenity'] === 'bicycle_parking' ? { type: 'free' } : { type: 'unknown' }, note: null };
  }
  if (fee === 'no') {
    return { price: { type: 'free' }, note: null };
  }
  if (fee === 'yes') {
    return { price: { type: 'paid', dailyIls: null }, note: tags['charge'] === undefined ? null : tags['charge'] };
  }
  // Conditional fees such as "Su-Th 08:00-17:00" — paid at some times.
  return { price: { type: 'paid', dailyIls: null }, note: fee };
}

function vehicleTypesFor(tags: Record<string, string>): VehicleType[] {
  return tags['amenity'] === 'bicycle_parking' ? ['bicycle', 'scooter'] : ['car'];
}

function parseCapacity(tags: Record<string, string>): number | null {
  const capacity = tags['capacity'];
  return capacity !== undefined && /^\d+$/.test(capacity) ? Number(capacity) : null;
}

/** Converts an OSM parking element into a ParkingSpot, or null when it is unusable for park & ride. */
export function spotFromOsm(element: OsmElement, stations: Station[]): ParkingSpot | null {
  const access = element.tags['access'];
  if (!isParking(element) || (access !== undefined && RESTRICTED_ACCESS.has(access))) {
    return null;
  }
  const station = nearestStation(element.location, stations);
  if (station.distanceMeters > MAX_STATION_DISTANCE_METERS) {
    return null;
  }
  const { price, note } = priceFromTags(element.tags);
  const parkRide = element.tags['park_ride'];
  return {
    id: `osm:${element.type}/${element.id}`,
    name: element.tags['name'] === undefined ? null : element.tags['name'],
    nameEn: element.tags['name:en'] === undefined ? null : element.tags['name:en'],
    location: element.location,
    source: 'osm',
    vehicleTypes: vehicleTypesFor(element.tags),
    price,
    priceNote: note,
    capacity: parseCapacity(element.tags),
    openingHours: element.tags['opening_hours'] === undefined ? null : element.tags['opening_hours'],
    isParkAndRide: parkRide !== undefined && parkRide !== 'no',
    nearestStation: station,
  };
}

/** GeoJSON Polygon / MultiPolygon → outer rings as LatLng arrays. */
export function outerRingsFromGeoJson(geometry: unknown): LatLng[][] {
  const geo = requireObject(geometry, 'geojson geometry');
  const type = requireString(geo['type'], 'geojson.type');
  const toRing = (ring: unknown): LatLng[] =>
    (ring as unknown[]).map((pair) => {
      const [lng, lat] = pair as [unknown, unknown];
      return { lat: requireNumber(lat, 'geojson lat'), lng: requireNumber(lng, 'geojson lng') };
    });
  if (type === 'Polygon') {
    return [toRing((geo['coordinates'] as unknown[])[0])];
  }
  assert(type === 'MultiPolygon', `Unsupported zone geometry type ${type}`);
  return (geo['coordinates'] as unknown[][]).map((polygon) => toRing(polygon[0]));
}
