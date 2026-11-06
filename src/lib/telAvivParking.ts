// Tel Aviv municipal parking lots (Ahuzot HaHof) with live occupancy status.
// Free, public ArcGIS layer of the Tel Aviv GIS; it allows browser (CORS) requests from the app's origin.
// Layer: https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970

import { requireArray, requireNumber, requireObject, requireString } from './assert.ts';
import { haversineMeters } from './geo.ts';
import { isParkAndRideName, isUsefulForParkAndRide, nearestStation } from './osmImport.ts';
import type { Station } from './osmImport.ts';
import type { LatLng, ParkingSpot } from './types.ts';

/** OSM car lots this close to a municipal lot are treated as the same lot (the municipal one wins: it has live status). */
export const DUPLICATE_DISTANCE_METERS = 80;

const LAYER_QUERY_URL = 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970/query';

export type LotOccupancy = 'available' | 'few' | 'full' | 'closed' | 'open_no_count' | 'no_data';

/** Values of the layer's `status_chenyon` field. An unknown value fails fast with a clear message. */
const OCCUPANCY_BY_STATUS: Record<string, LotOccupancy> = {
  פנוי: 'available',
  מעט: 'few',
  מלא: 'full',
  סגור: 'closed',
  פעיל: 'open_no_count',
  '': 'no_data',
};

export interface LiveLotStatus {
  occupancy: LotOccupancy;
  updatedAt: Date | null;
}

export interface AhuzotLot {
  code: number;
  name: string;
  location: LatLng;
  tariff: string;
  openingHours: string;
  capacity: number;
  status: LiveLotStatus;
}

export const ahuzotSpotId = (lotCode: number): string => `tlv-ahuzot:${lotCode}`;

export function parseOccupancy(raw: string): LotOccupancy {
  const occupancy = OCCUPANCY_BY_STATUS[raw.trim()];
  if (occupancy === undefined) {
    throw new Error(`Unknown Tel Aviv parking status "${raw}"`);
  }
  return occupancy;
}

export const isFullOrClosed = (occupancy: LotOccupancy): boolean => occupancy === 'full' || occupancy === 'closed';

/** Offset of Asia/Jerusalem from UTC at a given instant, in ms (handles daylight saving time). */
function jerusalemOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (found === undefined) {
      throw new Error(`Missing ${type} in formatted date`);
    }
    return Number(found.value);
  };
  const wallAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The layer stores Israel wall-clock time as if it were UTC (observed: values ~2-3 h in the future).
 * Converts such a value to the real instant.
 */
export function fromIsraelWallClock(milliseconds: number): Date {
  return new Date(milliseconds - jerusalemOffsetMs(new Date(milliseconds)));
}

function parseStatus(attributes: Record<string, unknown>): LiveLotStatus {
  const timestamp = attributes['tr_status_chenyon'];
  return {
    occupancy: parseOccupancy(requireString(attributes['status_chenyon'], 'status_chenyon')),
    updatedAt: timestamp === null ? null : fromIsraelWallClock(requireNumber(timestamp, 'tr_status_chenyon')),
  };
}

export function parseAhuzotFeature(raw: unknown): AhuzotLot {
  const attributes = requireObject(requireObject(raw, 'ahuzot feature')['attributes'], 'ahuzot attributes');
  return {
    code: requireNumber(attributes['code_achoza'], 'code_achoza'),
    name: requireString(attributes['shem_chenyon'], 'shem_chenyon').trim(),
    location: { lat: requireNumber(attributes['lat'], 'lat'), lng: requireNumber(attributes['lon'], 'lon') },
    tariff: requireString(attributes['taarif_yom'], 'taarif_yom').trim(),
    openingHours: requireString(attributes['chalon_zman_chenyon_patoach'], 'chalon_zman_chenyon_patoach').trim(),
    capacity: requireNumber(attributes['mispar_mekomot_bchenyon'], 'mispar_mekomot_bchenyon'),
    status: parseStatus(attributes),
  };
}

async function queryLayer(outFields: string): Promise<unknown[]> {
  const params = new URLSearchParams({ where: '1=1', outFields, returnGeometry: 'false', f: 'json' });
  const response = await fetch(`${LAYER_QUERY_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Tel Aviv parking service error ${response.status}`);
  }
  const body = requireObject(await response.json(), 'tel aviv layer response');
  if ('error' in body) {
    throw new Error(`Tel Aviv parking service error: ${JSON.stringify(body['error'])}`);
  }
  return requireArray(body['features'], 'tel aviv layer features');
}

/** All lots with full details (used at build time). */
export async function fetchAhuzotLots(): Promise<AhuzotLot[]> {
  return (await queryLayer('*')).map(parseAhuzotFeature);
}

/** Live status of every lot, keyed by ParkingSpot id (used by the app when planning). */
export async function fetchAhuzotStatuses(): Promise<Map<string, LiveLotStatus>> {
  const features = await queryLayer('code_achoza,status_chenyon,tr_status_chenyon');
  return new Map(
    features.map((raw) => {
      const attributes = requireObject(requireObject(raw, 'ahuzot feature')['attributes'], 'ahuzot attributes');
      return [ahuzotSpotId(requireNumber(attributes['code_achoza'], 'code_achoza')), parseStatus(attributes)];
    }),
  );
}

/** Converts a municipal lot into a ParkingSpot, or null when it is far from rapid transit. */
export function spotFromAhuzot(lot: AhuzotLot, stations: Station[]): ParkingSpot | null {
  const station = nearestStation(lot.location, stations);
  const isParkAndRide = isParkAndRideName(lot.name);
  if (!isUsefulForParkAndRide(isParkAndRide, station)) {
    return null;
  }
  return {
    id: ahuzotSpotId(lot.code),
    name: lot.name,
    nameEn: null,
    location: lot.location,
    source: 'tlv-ahuzot',
    vehicleTypes: ['car'],
    // The tariff is free text (hourly rules), so the daily amount is not parsed; it is shown as a note.
    price: { type: 'paid', dailyIls: null },
    priceNote: lot.tariff === '' ? null : lot.tariff,
    capacity: lot.capacity > 0 ? lot.capacity : null,
    openingHours: lot.openingHours === '' ? null : lot.openingHours,
    isParkAndRide,
    liveStatus: { provider: 'tlv-ahuzot', lotCode: lot.code },
    nearestStation: station,
  };
}

/** Drops car spots that duplicate a preferred spot (e.g. an OSM polygon of the same municipal lot). */
export function withoutDuplicates(spots: ParkingSpot[], preferred: ParkingSpot[]): ParkingSpot[] {
  return spots.filter(
    (spot) => !spot.vehicleTypes.includes('car') || !preferred.some((p) => haversineMeters(p.location, spot.location) <= DUPLICATE_DISTANCE_METERS),
  );
}
