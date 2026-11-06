// Park-and-ride planner: "Candidate Park-and-Ride Search" (see docs/RESEARCH.md §4.2).
//
// 1. Filter our parking dataset to spots that match the user's vehicle, price, walking and avoid-zone rules
//    and lie inside a detour ellipse around A→B.
// 2. Rank by a straight-line estimate, then refine the best ones with real street travel times (one request).
// 3. For the top K spots, fetch the real vehicle route A→P and public-transport routes P→B.
// 4. Score each combination with a generalized cost and highlight the fastest / cheapest / balanced option.
// Lots whose live status (Tel Aviv municipal lots) reports full or closed are skipped before step 2.

import { haversineMeters, isPointInRing } from './geo.ts';
import { isFullOrClosed } from './telAvivParking.ts';
import type { LiveLotStatus } from './telAvivParking.ts';
import { rideAccess, walkAccess } from './transitous.ts';
import type { Itinerary, RouteLeg, RoutingApi, StreetAccess } from './transitous.ts';
import type { AvoidZone, LatLng, ParkingSpot, Settings, TripRequest, VehicleType } from './types.ts';

/** dist(A,P) + dist(P,B) must not exceed this factor × dist(A,B). */
export const DETOUR_FACTOR = 1.5;
/** How many spots get a real street-time lookup (one batched request), plus extra park-and-ride lots. */
export const STREET_LOOKUP_COUNT = 25;
export const STREET_LOOKUP_EXTRA_PARK_AND_RIDE = 5;
/** How many spots get full vehicle + transit routing (two requests each), plus extra park-and-ride lots. */
export const FULL_ROUTING_COUNT = 5;
export const FULL_ROUTING_EXTRA_PARK_AND_RIDE = 2;
const MAX_VEHICLE_SECONDS = 2 * 60 * 60;
/** Time to park, lock and walk out of the lot before the transit part starts. */
const PARKING_BUFFER_SECONDS: Record<VehicleType, number> = { car: 5 * 60, bicycle: 2 * 60, scooter: 2 * 60 };
/** Straight-line speeds used only for the first ranking. */
const ESTIMATE_SPEED_MPS: Record<VehicleType, number> = { car: 11, bicycle: 4.2, scooter: 5.5 };
const ESTIMATE_TRANSIT_SPEED_MPS = 6;
const WALKING_SPEED_MPS = 1.3;
/** Longest ride at each end when the bicycle/scooter is carried on board. */
const CARRY_ON_MAX_RIDE_SECONDS = 20 * 60;
/** Generalized-cost penalties, in minutes. */
const TRANSFER_PENALTY_MINUTES = 5;
const EXTRA_WALK_WEIGHT = 0.5;

export type OptionKind = 'park_and_ride' | 'vehicle_only' | 'transit_only' | 'carry_on';

export interface TripOption {
  id: string;
  kind: OptionKind;
  spot: ParkingSpot | null;
  /** All legs in order: the vehicle leg (if any) followed by the transit itinerary legs. */
  legs: RouteLeg[];
  departure: Date;
  arrival: Date;
  totalMinutes: number;
  walkMinutes: number;
  transfers: number;
  parkingCostIls: number | null;
  fuelCostIls: number;
  generalizedCost: number;
}

export interface Highlights {
  fastest: TripOption;
  cheapest: TripOption;
  balanced: TripOption;
}

export interface PlanResult {
  candidatesConsidered: number;
  /** Candidates dropped because their live status said full or closed. */
  skippedFullOrClosed: number;
  liveStatuses: Map<string, LiveLotStatus>;
  liveStatusError: string | null;
  options: TripOption[];
  highlights: Highlights | null;
  vehicleOnly: TripOption | null;
  transitOnly: TripOption | null;
  /** Bicycle/scooter carried on board, ridden at both ends (only when requested). */
  carryOn: TripOption | null;
}

// ---------- Step 1: candidate filtering (pure) ----------

export function isInsideAnyZone(point: LatLng, zones: AvoidZone[]): boolean {
  return zones.some((zone) => zone.rings.some((ring) => isPointInRing(point, ring)));
}

export function isPriceAccepted(spot: ParkingSpot, settings: Settings): boolean {
  switch (spot.price.type) {
    case 'free':
      return true;
    case 'unknown':
      return settings.pricePolicy === 'allow_paid';
    case 'paid':
      return settings.pricePolicy === 'allow_paid' && (spot.price.dailyIls === null || spot.price.dailyIls <= settings.maxDailyPriceIls);
  }
}

export function isWithinDetour(spot: ParkingSpot, origin: LatLng, destination: LatLng): boolean {
  const direct = haversineMeters(origin, destination);
  return haversineMeters(origin, spot.location) + haversineMeters(spot.location, destination) <= DETOUR_FACTOR * direct;
}

export function filterCandidates(spots: ParkingSpot[], request: TripRequest, settings: Settings, zones: AvoidZone[]): ParkingSpot[] {
  const activeZones = zones.filter((zone) => settings.avoidZoneIds.includes(zone.id));
  return spots.filter(
    (spot) =>
      spot.vehicleTypes.includes(request.vehicle) &&
      isPriceAccepted(spot, settings) &&
      // Park-and-ride lots are built for transit (often shuttle buses), so the rail-walk rule does not apply.
      (spot.isParkAndRide || spot.nearestStation.distanceMeters <= settings.maxWalkMeters) &&
      !isInsideAnyZone(spot.location, activeZones) &&
      isWithinDetour(spot, request.origin.location, request.destination.location),
  );
}

/**
 * Rough door-to-door seconds via a spot, using straight-line distances.
 * Ordinary lots: walk to the nearest rail station, then transit. Park-and-ride lots: transit starts at the lot.
 */
export function estimateSecondsVia(spot: ParkingSpot, request: TripRequest, vehicleSeconds: number | null): number {
  const vehicle = vehicleSeconds === null ? haversineMeters(request.origin.location, spot.location) / ESTIMATE_SPEED_MPS[request.vehicle] : vehicleSeconds;
  const transitStart = spot.isParkAndRide ? spot.location : spot.nearestStation.location;
  const walk = spot.isParkAndRide ? 0 : spot.nearestStation.distanceMeters / WALKING_SPEED_MPS;
  const transit = haversineMeters(transitStart, request.destination.location) / ESTIMATE_TRANSIT_SPEED_MPS;
  return vehicle + walk + transit;
}

/**
 * The first `count` spots of an already ranked list, plus the best `extraParkAndRide`
 * official park-and-ride lots that did not make the cut — so park & ride is always considered.
 */
export function topWithParkAndRide(ranked: ParkingSpot[], count: number, extraParkAndRide: number): ParkingSpot[] {
  const extras = ranked.slice(count).filter((spot) => spot.isParkAndRide).slice(0, extraParkAndRide);
  return [...ranked.slice(0, count), ...extras];
}

// ---------- Step 4: scoring (pure) ----------

const minutesBetween = (start: Date, end: Date): number => (end.getTime() - start.getTime()) / 60_000;

export function walkMinutesOf(legs: RouteLeg[]): number {
  return legs.filter((leg) => leg.mode === 'WALK').reduce((sum, leg) => sum + leg.durationSeconds / 60, 0);
}

export function parkingCostIls(spot: ParkingSpot): number | null {
  switch (spot.price.type) {
    case 'free':
      return 0;
    case 'paid':
      return spot.price.dailyIls;
    case 'unknown':
      return null;
  }
}

/**
 * Generalized cost in minutes = time + money converted to minutes + transfer and walking penalties.
 * Unknown parking prices are assumed to be the user's maximum, so unknown never looks cheaper than known.
 */
export function generalizedCost(option: Pick<TripOption, 'totalMinutes' | 'walkMinutes' | 'transfers' | 'parkingCostIls' | 'fuelCostIls'>, settings: Settings): number {
  const money = (option.parkingCostIls ?? settings.maxDailyPriceIls) + option.fuelCostIls;
  const moneyMinutes = money / (settings.valueOfTimeIlsPerHour / 60);
  return option.totalMinutes + moneyMinutes + option.transfers * TRANSFER_PENALTY_MINUTES + option.walkMinutes * EXTRA_WALK_WEIGHT;
}

export function fuelCostIls(vehicle: VehicleType, legs: RouteLeg[], settings: Settings): number {
  if (vehicle !== 'car') {
    return 0;
  }
  const carMeters = legs
    .filter((leg) => leg.mode === 'CAR')
    .reduce((sum, leg) => {
      if (leg.distanceMeters === null) {
        throw new Error('A CAR leg must have a distance');
      }
      return sum + leg.distanceMeters;
    }, 0);
  return (carMeters / 1000) * settings.fuelCostPerKmIls;
}

export function buildOption(kind: OptionKind, spot: ParkingSpot | null, legs: RouteLeg[], transfers: number, request: TripRequest, settings: Settings): TripOption {
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('A trip option needs at least one leg');
  }
  const base = {
    totalMinutes: minutesBetween(request.departure, last.endTime),
    walkMinutes: walkMinutesOf(legs),
    transfers,
    parkingCostIls: spot === null ? 0 : parkingCostIls(spot),
    fuelCostIls: fuelCostIls(request.vehicle, legs, settings),
  };
  return {
    id: `${kind}:${spot === null ? 'none' : spot.id}:${last.endTime.toISOString()}`,
    kind,
    spot,
    legs,
    departure: first.startTime,
    arrival: last.endTime,
    ...base,
    generalizedCost: generalizedCost(base, settings),
  };
}

const minBy = <T>(items: T[], key: (item: T) => number): T =>
  items.reduce((best, item) => (key(item) < key(best) ? item : best));

/** Unknown parking prices never win "cheapest". */
const knownParkingCost = (option: TripOption): number => (option.parkingCostIls === null ? Number.POSITIVE_INFINITY : option.parkingCostIls);

export function pickHighlights(options: TripOption[]): Highlights | null {
  if (options.length === 0) {
    return null;
  }
  // "Cheapest" = lowest parking price; among equally priced spots, the best overall option.
  // (Fuel differences between nearby spots are small and must not pick a much slower trip.)
  const lowestParking = Math.min(...options.map(knownParkingCost));
  const cheapestPriced = options.filter((o) => knownParkingCost(o) === lowestParking);
  return {
    fastest: minBy(options, (o) => o.totalMinutes),
    cheapest: minBy(cheapestPriced, (o) => o.generalizedCost),
    balanced: minBy(options, (o) => o.generalizedCost),
  };
}

// ---------- Orchestration (network) ----------

/** Routing plus live lot status; injected so the planner can be unit-tested. */
export interface PlannerApi extends RoutingApi {
  lotStatuses: () => Promise<Map<string, LiveLotStatus>>;
}

interface LiveStatusLookup {
  statuses: Map<string, LiveLotStatus>;
  /** Set when the live-status service failed; planning continues without it and the UI shows this. */
  error: string | null;
}

async function lookUpLiveStatuses(candidates: ParkingSpot[], api: PlannerApi): Promise<LiveStatusLookup> {
  if (!candidates.some((spot) => spot.liveStatus !== null)) {
    return { statuses: new Map(), error: null };
  }
  return api.lotStatuses().then(
    (statuses) => ({ statuses, error: null }),
    (reason: Error) => ({ statuses: new Map(), error: reason.message }),
  );
}

export function isReportedFullOrClosed(spot: ParkingSpot, statuses: Map<string, LiveLotStatus>): boolean {
  const status = statuses.get(spot.id);
  return status !== undefined && isFullOrClosed(status.occupancy);
}

const walkingAccess = (settings: Settings): StreetAccess => walkAccess(Math.round(settings.maxWalkMeters / WALKING_SPEED_MPS));

async function rankByStreetTime(candidates: ParkingSpot[], request: TripRequest, api: RoutingApi): Promise<ParkingSpot[]> {
  const byEstimate = [...candidates].sort((a, b) => estimateSecondsVia(a, request, null) - estimateSecondsVia(b, request, null));
  const shortlist = topWithParkAndRide(byEstimate, STREET_LOOKUP_COUNT, STREET_LOOKUP_EXTRA_PARK_AND_RIDE);
  if (shortlist.length === 0) {
    return [];
  }
  const durations = await api.streetDurations(request.origin.location, shortlist.map((s) => s.location), request.vehicle, MAX_VEHICLE_SECONDS);
  return shortlist
    .map((spot, index) => ({ spot, seconds: durations[index]! }))
    .filter((entry): entry is { spot: ParkingSpot; seconds: number } => entry.seconds !== null)
    .sort((a, b) => estimateSecondsVia(a.spot, request, a.seconds) - estimateSecondsVia(b.spot, request, b.seconds))
    .map((entry) => entry.spot);
}

async function routeViaSpot(spot: ParkingSpot, request: TripRequest, settings: Settings, api: RoutingApi): Promise<TripOption[]> {
  const vehicleRoute = await api.streetRoute(request.origin.location, spot.location, request.vehicle, request.departure, settings.language);
  if (vehicleRoute === null) {
    return [];
  }
  const transitDeparture = new Date(vehicleRoute.endTime.getTime() + PARKING_BUFFER_SECONDS[request.vehicle] * 1000);
  const itineraries = await api.transitRoutes(spot.location, request.destination.location, transitDeparture, walkingAccess(settings), settings.language);
  return itineraries.map((itinerary) =>
    buildOption('park_and_ride', spot, [...vehicleRoute.legs, ...itinerary.legs], itinerary.transfers, request, settings),
  );
}

async function vehicleOnlyOption(request: TripRequest, settings: Settings, api: RoutingApi): Promise<TripOption | null> {
  const route = await api.streetRoute(request.origin.location, request.destination.location, request.vehicle, request.departure, settings.language);
  return route === null ? null : buildOption('vehicle_only', null, route.legs, 0, request, settings);
}

/** Best public-transport trip between A and B with the given access mode, as an option of `kind`. */
async function bestTransitOption(kind: 'transit_only' | 'carry_on', access: StreetAccess, request: TripRequest, settings: Settings, api: RoutingApi): Promise<TripOption | null> {
  const itineraries = await api.transitRoutes(request.origin.location, request.destination.location, request.departure, access, settings.language);
  const options = itineraries
    .filter((it) => it.legs.some((leg) => leg.isTransit))
    .map((it) => buildOption(kind, null, it.legs, it.transfers, request, settings));
  return options.length === 0 ? null : minBy(options, (o) => o.generalizedCost);
}

async function carryOnOption(request: TripRequest, settings: Settings, api: RoutingApi): Promise<TripOption | null> {
  if (!request.carryVehicle) {
    return null;
  }
  return bestTransitOption('carry_on', rideAccess(request.vehicle, CARRY_ON_MAX_RIDE_SECONDS), request, settings, api);
}

/** Keeps the best option per parking spot, ordered by generalized cost. */
function bestPerSpot(options: TripOption[]): TripOption[] {
  const best = new Map<string, TripOption>();
  for (const option of options) {
    const key = option.spot === null ? option.id : option.spot.id;
    const current = best.get(key);
    if (current === undefined || option.generalizedCost < current.generalizedCost) {
      best.set(key, option);
    }
  }
  return [...best.values()].sort((a, b) => a.generalizedCost - b.generalizedCost);
}

export async function planTrip(request: TripRequest, settings: Settings, spots: ParkingSpot[], zones: AvoidZone[], api: PlannerApi): Promise<PlanResult> {
  if (request.carryVehicle && request.vehicle === 'car') {
    throw new Error('carryVehicle is only possible with a bicycle or scooter');
  }
  const candidates = filterCandidates(spots, request, settings, zones);
  const live = await lookUpLiveStatuses(candidates, api);
  const open = candidates.filter((spot) => !isReportedFullOrClosed(spot, live.statuses));
  const ranked = await rankByStreetTime(open, request, api);
  const [viaSpots, vehicleOnly, transitOnly, carryOn] = await Promise.all([
    Promise.all(topWithParkAndRide(ranked, FULL_ROUTING_COUNT, FULL_ROUTING_EXTRA_PARK_AND_RIDE).map((spot) => routeViaSpot(spot, request, settings, api))),
    vehicleOnlyOption(request, settings, api),
    bestTransitOption('transit_only', walkingAccess(settings), request, settings, api),
    carryOnOption(request, settings, api),
  ]);
  const options = bestPerSpot(viaSpots.flat());
  return {
    candidatesConsidered: candidates.length,
    skippedFullOrClosed: candidates.length - open.length,
    liveStatuses: live.statuses,
    liveStatusError: live.error,
    options,
    highlights: pickHighlights(options),
    vehicleOnly,
    transitOnly,
    carryOn,
  };
}

/** The public-transport trip back from the destination to the parked vehicle. */
export async function planReturnTrip(option: TripOption, request: TripRequest, settings: Settings, api: RoutingApi): Promise<Itinerary | null> {
  if (option.spot === null || request.returnDeparture === null) {
    throw new Error('planReturnTrip needs a park-and-ride option and a return time');
  }
  const itineraries = await api.transitRoutes(request.destination.location, option.spot.location, request.returnDeparture, walkingAccess(settings), settings.language);
  return itineraries.length === 0 ? null : minBy(itineraries, (it) => it.endTime.getTime());
}
