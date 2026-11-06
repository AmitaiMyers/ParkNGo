// Shared domain types. Every field is required; "no value" is an explicit `null`,
// so missing data is caught by validation instead of silently defaulting.

export type VehicleType = 'car' | 'bicycle' | 'scooter';
export const VEHICLE_TYPES: readonly VehicleType[] = ['car', 'bicycle', 'scooter'];

export type Language = 'en' | 'he';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  name: string;
  location: LatLng;
}

export type ParkingPrice =
  | { type: 'free' }
  | { type: 'paid'; dailyIls: number | null } // null = paid, amount unknown
  | { type: 'unknown' }; // source does not say whether it is free

export interface NearestStation {
  name: string;
  distanceMeters: number;
  location: LatLng;
}

/** Where to fetch live occupancy for a spot (null = no live data). */
export type LiveStatusSource = { provider: 'tlv-ahuzot'; lotCode: number };

export const SPOT_SOURCES = ['osm', 'curated', 'tlv-ahuzot'] as const;

export interface ParkingSpot {
  id: string;
  name: string | null;
  nameEn: string | null;
  location: LatLng;
  source: (typeof SPOT_SOURCES)[number];
  vehicleTypes: VehicleType[];
  price: ParkingPrice;
  priceNote: string | null;
  capacity: number | null;
  openingHours: string | null;
  isParkAndRide: boolean;
  liveStatus: LiveStatusSource | null;
  nearestStation: NearestStation;
}

export interface AvoidZone {
  id: string;
  name: Record<Language, string>;
  /** Outer rings of the zone polygon(s). */
  rings: LatLng[][];
}

export interface ParkingDataset {
  generatedAt: string;
  attribution: string;
  spots: ParkingSpot[];
  avoidZones: AvoidZone[];
}

export type PricePolicy = 'free_only' | 'allow_paid';

export interface Settings {
  language: Language;
  vehicle: VehicleType;
  pricePolicy: PricePolicy;
  maxDailyPriceIls: number;
  maxWalkMeters: number;
  avoidZoneIds: string[];
  fuelCostPerKmIls: number;
  valueOfTimeIlsPerHour: number;
  voiceGuidance: boolean;
}

export interface TripRequest {
  origin: Place;
  destination: Place;
  vehicle: VehicleType;
  /** Bicycle/scooter only: take it on board (folded) and ride the first and last stretch. */
  carryVehicle: boolean;
  departure: Date;
  /** When set, the app also plans the public-transport trip back to the parked vehicle. */
  returnDeparture: Date | null;
}

export interface ParkedVehicle {
  location: LatLng;
  label: string;
  savedAt: string;
}
