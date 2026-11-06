import { describe, expect, it } from 'vitest';
import { parseParkingSpot } from '../src/lib/dataset.ts';
import { outerRingsFromGeoJson, parseOsmElement, priceFromTags, spotFromOsm, stationsFrom } from '../src/lib/osmImport.ts';

const station = parseOsmElement({ type: 'node', id: 1, lat: 32.1, lon: 34.8, tags: { railway: 'station', name: 'Tel Aviv University' } });

describe('parseOsmElement', () => {
  it('uses lat/lon for nodes and center for ways', () => {
    const way = parseOsmElement({ type: 'way', id: 2, center: { lat: 32.2, lon: 34.9 }, tags: { amenity: 'parking' } });
    expect(way.location).toEqual({ lat: 32.2, lng: 34.9 });
  });

  it('fails fast when a way has no center', () => {
    expect(() => parseOsmElement({ type: 'way', id: 3, tags: {} })).toThrow(/center/);
  });
});

describe('priceFromTags', () => {
  it('maps fee tags to prices', () => {
    expect(priceFromTags({ amenity: 'parking', fee: 'no' }).price).toEqual({ type: 'free' });
    expect(priceFromTags({ amenity: 'parking', fee: 'yes' }).price).toEqual({ type: 'paid', dailyIls: null });
    expect(priceFromTags({ amenity: 'parking' }).price).toEqual({ type: 'unknown' });
    expect(priceFromTags({ amenity: 'bicycle_parking' }).price).toEqual({ type: 'free' });
    expect(priceFromTags({ amenity: 'parking', fee: 'Su-Th 08:00-17:00' })).toEqual({ price: { type: 'paid', dailyIls: null }, note: 'Su-Th 08:00-17:00' });
  });
});

describe('spotFromOsm', () => {
  const stations = stationsFrom([station]);

  it('creates a valid spot near a station', () => {
    const element = parseOsmElement({ type: 'node', id: 10, lat: 32.101, lon: 34.8, tags: { amenity: 'parking', fee: 'no', park_ride: 'train', capacity: '120' } });
    const spot = spotFromOsm(element, stations)!;
    expect(spot.id).toBe('osm:node/10');
    expect(spot.isParkAndRide).toBe(true);
    expect(spot.capacity).toBe(120);
    expect(spot.nearestStation.name).toBe('Tel Aviv University');
    expect(spot.nearestStation.distanceMeters).toBeGreaterThan(100);
    expect(parseParkingSpot(JSON.parse(JSON.stringify(spot)))).toEqual(spot);
  });

  it('skips private lots and lots far from any station', () => {
    const privateLot = parseOsmElement({ type: 'node', id: 11, lat: 32.101, lon: 34.8, tags: { amenity: 'parking', access: 'private' } });
    const farLot = parseOsmElement({ type: 'node', id: 12, lat: 32.2, lon: 34.8, tags: { amenity: 'parking' } });
    expect(spotFromOsm(privateLot, stations)).toBeNull();
    expect(spotFromOsm(farLot, stations)).toBeNull();
  });

  it('bicycle racks are for bicycles and scooters', () => {
    const rack = parseOsmElement({ type: 'node', id: 13, lat: 32.1001, lon: 34.8, tags: { amenity: 'bicycle_parking' } });
    expect(spotFromOsm(rack, stations)!.vehicleTypes).toEqual(['bicycle', 'scooter']);
  });
});

describe('outerRingsFromGeoJson', () => {
  it('reads Polygon and MultiPolygon outer rings as lat/lng', () => {
    const ring = [[34.7, 32.0], [34.8, 32.0], [34.8, 32.1], [34.7, 32.0]];
    expect(outerRingsFromGeoJson({ type: 'Polygon', coordinates: [ring] })[0]![1]).toEqual({ lat: 32.0, lng: 34.8 });
    expect(outerRingsFromGeoJson({ type: 'MultiPolygon', coordinates: [[ring], [ring]] })).toHaveLength(2);
  });
});
