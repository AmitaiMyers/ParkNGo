import { describe, expect, it } from 'vitest';
import { fromIsraelWallClock, parseAhuzotFeature, parseOccupancy, spotFromAhuzot, withoutDuplicates } from '../src/lib/telAvivParking.ts';
import { stationsFrom, parseOsmElement } from '../src/lib/osmImport.ts';
import { parseParkingSpot } from '../src/lib/dataset.ts';
import { makeSpot } from './fixtures.ts';

// A real feature from layer 970 (trimmed tariff text).
const FEATURE = {
  attributes: {
    code_achoza: 10,
    shem_chenyon: 'בזל',
    lon: 34.7801,
    lat: 32.09,
    taarif_yom: 'לשעה ראשונה 16 ₪',
    chalon_zman_chenyon_patoach: '',
    mispar_mekomot_bchenyon: 0,
    status_chenyon: 'פנוי',
    tr_status_chenyon: Date.UTC(2026, 10, 6, 15, 22, 23), // Israel wall-clock 15:22 stored as UTC
  },
};

describe('parseOccupancy', () => {
  it('maps the municipal status values', () => {
    expect(parseOccupancy('פנוי')).toBe('available');
    expect(parseOccupancy('מעט')).toBe('few');
    expect(parseOccupancy('מלא')).toBe('full');
    expect(parseOccupancy('סגור')).toBe('closed');
    expect(parseOccupancy('פעיל')).toBe('open_no_count');
    expect(parseOccupancy('')).toBe('no_data');
  });

  it('fails fast on an unknown status', () => {
    expect(() => parseOccupancy('חדש')).toThrow(/Unknown Tel Aviv parking status/);
  });
});

describe('fromIsraelWallClock', () => {
  it('converts Israel wall-clock time stored as UTC (winter UTC+2, summer UTC+3)', () => {
    expect(fromIsraelWallClock(Date.UTC(2026, 10, 6, 15, 22)).toISOString()).toBe('2026-11-06T13:22:00.000Z');
    expect(fromIsraelWallClock(Date.UTC(2026, 6, 1, 12, 0)).toISOString()).toBe('2026-07-01T09:00:00.000Z');
  });
});

describe('spotFromAhuzot', () => {
  const stations = stationsFrom([parseOsmElement({ type: 'node', id: 1, lat: 32.0905, lon: 34.781, tags: { railway: 'station', name: 'X' } })]);

  it('creates a car spot with live status and a tariff note', () => {
    const lot = parseAhuzotFeature(FEATURE);
    expect(lot.status.updatedAt!.toISOString()).toBe('2026-11-06T13:22:23.000Z');
    const spot = spotFromAhuzot(lot, stations)!;
    expect(spot.id).toBe('tlv-ahuzot:10');
    expect(spot.liveStatus).toEqual({ provider: 'tlv-ahuzot', lotCode: 10 });
    expect(spot.priceNote).toBe('לשעה ראשונה 16 ₪');
    expect(spot.capacity).toBeNull();
    expect(parseParkingSpot(JSON.parse(JSON.stringify(spot)))).toEqual(spot);
  });

  it('withoutDuplicates drops OSM car lots next to a municipal lot but keeps bicycle racks', () => {
    const municipal = spotFromAhuzot(parseAhuzotFeature(FEATURE), stations)!;
    const osmSameLot = makeSpot({ id: 'osm:way/1', location: { lat: 32.0902, lng: 34.7802 } });
    const osmRack = makeSpot({ id: 'osm:node/2', location: { lat: 32.0902, lng: 34.7802 }, vehicleTypes: ['bicycle', 'scooter'] });
    const osmFar = makeSpot({ id: 'osm:way/3', location: { lat: 32.1, lng: 34.8 } });
    expect(withoutDuplicates([osmSameLot, osmRack, osmFar], [municipal]).map((s) => s.id)).toEqual(['osm:node/2', 'osm:way/3']);
  });
});
