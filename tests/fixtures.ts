import type { RouteLeg, Itinerary } from '../src/lib/transitous.ts';
import type { LatLng, ParkingSpot, Settings, TripRequest } from '../src/lib/types.ts';
import { DEFAULT_SETTINGS } from '../src/lib/storage.ts';

export const RAANANA: LatLng = { lat: 32.1848, lng: 34.8713 };
export const AZRIELI: LatLng = { lat: 32.0744, lng: 34.7925 };

export const settings: Settings = { ...DEFAULT_SETTINGS, language: 'en', avoidZoneIds: [] };

export function makeSpot(overrides: Partial<ParkingSpot> & Pick<ParkingSpot, 'id' | 'location'>): ParkingSpot {
  return {
    name: null,
    nameEn: null,
    source: 'osm',
    vehicleTypes: ['car'],
    price: { type: 'free' },
    priceNote: null,
    capacity: null,
    openingHours: null,
    isParkAndRide: false,
    liveStatus: null,
    nearestStation: { name: 'Station', distanceMeters: 200, location: overrides.location },
    ...overrides,
  };
}

export function makeRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: { name: 'A', location: RAANANA },
    destination: { name: 'B', location: AZRIELI },
    vehicle: 'car',
    carryVehicle: false,
    departure: new Date('2026-11-08T07:00:00Z'),
    returnDeparture: null,
    ...overrides,
  };
}

export function makeLeg(mode: string, from: LatLng, to: LatLng, start: Date, minutes: number, distanceMeters: number | null): RouteLeg {
  const isTransit = !['WALK', 'BIKE', 'CAR'].includes(mode);
  return {
    mode,
    isTransit,
    fromName: '',
    toName: '',
    from,
    to,
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60_000),
    durationSeconds: minutes * 60,
    distanceMeters: isTransit ? null : distanceMeters,
    geometry: [from, to],
    steps: [],
    line: isTransit ? { shortName: '1', headsign: 'X', agency: 'Y' } : null,
  };
}

export function itineraryOf(legs: RouteLeg[], transfers: number): Itinerary {
  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  return { startTime: first.startTime, endTime: last.endTime, durationSeconds: (last.endTime.getTime() - first.startTime.getTime()) / 1000, transfers, legs };
}
