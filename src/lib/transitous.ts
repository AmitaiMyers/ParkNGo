// Client for the Transitous public routing API (MOTIS 2 engine).
// API spec: https://raw.githubusercontent.com/motis-project/motis/master/openapi.yaml
// Usage policy: https://transitous.org/api/ (free, best-effort, non-commercial; browsers send a Referer).

import { assert, optionalNumber, optionalString, requireArray, requireNumber, requireObject, requireString } from './assert.ts';
import { decodePolyline, formatLatLng } from './geo.ts';
import type { Language, LatLng, Place, VehicleType } from './types.ts';

const API_BASE_URL = 'https://api.transitous.org';
/** Biases geocoding results towards Gush Dan (the MVP area). */
const GEOCODE_BIAS_CENTER: LatLng = { lat: 32.08, lng: 34.8 };
const GEOCODE_RESULT_COUNT = 6;
const STREET_MATCHING_DISTANCE_METERS = 250;

export type StreetMode = 'WALK' | 'BIKE' | 'CAR';

interface VehicleProfile {
  mode: StreetMode;
  /** Meters per second; only used for bicycle-profile vehicles. */
  cyclingSpeed: number | null;
}

const VEHICLE_PROFILES: Record<VehicleType, VehicleProfile> = {
  car: { mode: 'CAR', cyclingSpeed: null },
  bicycle: { mode: 'BIKE', cyclingSpeed: 4.2 }, // ~15 km/h
  scooter: { mode: 'BIKE', cyclingSpeed: 5.5 }, // ~20 km/h (Israeli e-scooter limit is 25 km/h)
};

export function vehicleStreetMode(vehicle: VehicleType): StreetMode {
  return VEHICLE_PROFILES[vehicle].mode;
}

export interface RouteStep {
  streetName: string;
  distanceMeters: number;
  points: LatLng[];
}

/** Line details; each field is optional in the MOTIS schema, so null means "not provided". */
export interface TransitLine {
  shortName: string | null;
  headsign: string | null;
  agency: string | null;
}

export interface RouteLeg {
  mode: string;
  isTransit: boolean;
  fromName: string;
  toName: string;
  from: LatLng;
  to: LatLng;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  distanceMeters: number | null;
  geometry: LatLng[];
  steps: RouteStep[];
  line: TransitLine | null;
}

export interface Itinerary {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  transfers: number;
  legs: RouteLeg[];
}

const STREET_LEG_MODES = new Set(['WALK', 'BIKE', 'CAR', 'CAR_PARKING', 'RENTAL']);

async function getJson(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${API_BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Routing service error ${response.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

function parseLatLon(raw: Record<string, unknown>, what: string): LatLng {
  return { lat: requireNumber(raw['lat'], `${what}.lat`), lng: requireNumber(raw['lon'], `${what}.lon`) };
}

function parsePolyline(raw: unknown, what: string): LatLng[] {
  const polyline = requireObject(raw, what);
  return decodePolyline(requireString(polyline['points'], `${what}.points`), requireNumber(polyline['precision'], `${what}.precision`));
}

function parseStep(raw: unknown): RouteStep {
  const step = requireObject(raw, 'step');
  return {
    streetName: requireString(step['streetName'], 'step.streetName'),
    distanceMeters: requireNumber(step['distance'], 'step.distance'),
    points: parsePolyline(step['polyline'], 'step.polyline'),
  };
}

function parseLeg(raw: unknown): RouteLeg {
  const leg = requireObject(raw, 'leg');
  const mode = requireString(leg['mode'], 'leg.mode');
  const isTransit = !STREET_LEG_MODES.has(mode);
  const from = requireObject(leg['from'], 'leg.from');
  const to = requireObject(leg['to'], 'leg.to');
  return {
    mode,
    isTransit,
    fromName: requireString(from['name'], 'leg.from.name'),
    toName: requireString(to['name'], 'leg.to.name'),
    from: parseLatLon(from, 'leg.from'),
    to: parseLatLon(to, 'leg.to'),
    startTime: new Date(requireString(leg['startTime'], 'leg.startTime')),
    endTime: new Date(requireString(leg['endTime'], 'leg.endTime')),
    durationSeconds: requireNumber(leg['duration'], 'leg.duration'),
    // `distance`, `steps` and the line fields are optional in the MOTIS schema.
    distanceMeters: isTransit ? null : optionalNumber(leg, 'distance', 'leg.distance'),
    geometry: parsePolyline(leg['legGeometry'], 'leg.legGeometry'),
    steps: !isTransit && 'steps' in leg ? requireArray(leg['steps'], 'leg.steps').map(parseStep) : [],
    line: isTransit
      ? {
          shortName: optionalString(leg, 'routeShortName', 'leg.routeShortName'),
          headsign: optionalString(leg, 'headsign', 'leg.headsign'),
          agency: optionalString(leg, 'agencyName', 'leg.agencyName'),
        }
      : null,
  };
}

function parseItinerary(raw: unknown): Itinerary {
  const itinerary = requireObject(raw, 'itinerary');
  return {
    startTime: new Date(requireString(itinerary['startTime'], 'itinerary.startTime')),
    endTime: new Date(requireString(itinerary['endTime'], 'itinerary.endTime')),
    durationSeconds: requireNumber(itinerary['duration'], 'itinerary.duration'),
    transfers: requireNumber(itinerary['transfers'], 'itinerary.transfers'),
    legs: requireArray(itinerary['legs'], 'itinerary.legs').map(parseLeg),
  };
}

function describeMatch(match: Record<string, unknown>): string {
  const name = requireString(match['name'], 'geocode.name');
  const areas = requireArray(match['areas'], 'geocode.areas').map((area) => requireObject(area, 'geocode.area'));
  const city = areas.find((area) => area['default'] === true);
  return city === undefined ? name : `${name}, ${requireString(city['name'], 'geocode.area.name')}`;
}

export async function geocode(text: string, language: Language): Promise<Place[]> {
  const raw = await getJson('/api/v1/geocode', {
    text,
    language,
    place: formatLatLng(GEOCODE_BIAS_CENTER),
    numResults: String(GEOCODE_RESULT_COUNT),
  });
  return requireArray(raw, 'geocode response').map((item) => {
    const match = requireObject(item, 'geocode match');
    return { name: describeMatch(match), location: parseLatLon(match, 'geocode match') };
  });
}

/** Street travel times from one origin to many targets. `null` = not reachable within maxSeconds. */
export async function streetDurations(origin: LatLng, targets: LatLng[], vehicle: VehicleType, maxSeconds: number): Promise<(number | null)[]> {
  assert(targets.length > 0, 'streetDurations needs at least one target');
  const toParam = (p: LatLng) => `${p.lat.toFixed(6)};${p.lng.toFixed(6)}`;
  const raw = await getJson('/api/v1/one-to-many', {
    one: toParam(origin),
    many: targets.map(toParam).join(','),
    mode: vehicleStreetMode(vehicle),
    max: String(maxSeconds),
    maxMatchingDistance: String(STREET_MATCHING_DISTANCE_METERS),
    arriveBy: 'false',
  });
  const results = requireArray(raw, 'one-to-many response');
  assert(results.length === targets.length, `one-to-many returned ${results.length} results for ${targets.length} targets`);
  return results.map((item) => {
    const result = requireObject(item, 'one-to-many result');
    return 'duration' in result ? requireNumber(result['duration'], 'one-to-many duration') : null;
  });
}

/** A street-only route (drive / ride / walk). Returns null when no route exists. */
export async function streetRoute(from: LatLng, to: LatLng, vehicle: VehicleType, departure: Date, language: Language): Promise<Itinerary | null> {
  const profile = VEHICLE_PROFILES[vehicle];
  const params: Record<string, string> = {
    fromPlace: formatLatLng(from),
    toPlace: formatLatLng(to),
    time: departure.toISOString(),
    directModes: profile.mode,
    transitModes: '', // empty = street routing only
    maxDirectTime: String(3 * 60 * 60),
    language,
  };
  if (profile.cyclingSpeed !== null) {
    params['cyclingSpeed'] = String(profile.cyclingSpeed);
  }
  const raw = requireObject(await getJson('/api/v6/plan', params), 'plan response');
  const direct = requireArray(raw['direct'], 'plan.direct');
  return direct.length === 0 ? null : parseItinerary(direct[0]);
}

/** Public-transport itineraries (with walking at both ends), departing at or after `departure`. */
export async function transitRoutes(from: LatLng, to: LatLng, departure: Date, maxWalkSeconds: number, language: Language): Promise<Itinerary[]> {
  const raw = requireObject(
    await getJson('/api/v6/plan', {
      fromPlace: formatLatLng(from),
      toPlace: formatLatLng(to),
      time: departure.toISOString(),
      preTransitModes: 'WALK',
      postTransitModes: 'WALK',
      directModes: 'WALK',
      maxPreTransitTime: String(maxWalkSeconds),
      maxPostTransitTime: String(maxWalkSeconds),
      language,
    }),
    'plan response',
  );
  const transit = requireArray(raw['itineraries'], 'plan.itineraries').map(parseItinerary);
  const walkOnly = requireArray(raw['direct'], 'plan.direct').map(parseItinerary);
  return [...transit, ...walkOnly];
}

/** The routing operations the planner needs; injected so the planner can be unit-tested. */
export interface RoutingApi {
  streetDurations: typeof streetDurations;
  streetRoute: typeof streetRoute;
  transitRoutes: typeof transitRoutes;
}

export const transitousApi: RoutingApi = { streetDurations, streetRoute, transitRoutes };
