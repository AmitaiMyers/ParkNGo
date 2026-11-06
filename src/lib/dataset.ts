// Parsing/validation of the static parking dataset (public/data/parking.json).

import {
  assert,
  nullableNumber,
  nullableString,
  requireArray,
  requireBoolean,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
} from './assert.ts';
import { SPOT_SOURCES, VEHICLE_TYPES } from './types.ts';
import type { AvoidZone, LatLng, LiveStatusSource, ParkingDataset, ParkingPrice, ParkingSpot } from './types.ts';

export function parseLatLng(raw: unknown, what: string): LatLng {
  const point = requireObject(raw, what);
  return { lat: requireNumber(point['lat'], `${what}.lat`), lng: requireNumber(point['lng'], `${what}.lng`) };
}

export function parsePrice(raw: unknown, what: string): ParkingPrice {
  const price = requireObject(raw, what);
  const type = requireOneOf(price['type'], ['free', 'paid', 'unknown'] as const, `${what}.type`);
  switch (type) {
    case 'free':
      return { type };
    case 'unknown':
      return { type };
    case 'paid':
      return { type, dailyIls: nullableNumber(price['dailyIls'], `${what}.dailyIls`) };
  }
}

function parseLiveStatusSource(raw: unknown, what: string): LiveStatusSource | null {
  if (raw === null) {
    return null;
  }
  const source = requireObject(raw, what);
  return { provider: requireOneOf(source['provider'], ['tlv-ahuzot'] as const, `${what}.provider`), lotCode: requireNumber(source['lotCode'], `${what}.lotCode`) };
}

export function parseParkingSpot(raw: unknown): ParkingSpot {
  const spot = requireObject(raw, 'parking spot');
  const id = requireString(spot['id'], 'spot.id');
  const station = requireObject(spot['nearestStation'], `${id}.nearestStation`);
  const vehicleTypes = requireArray(spot['vehicleTypes'], `${id}.vehicleTypes`).map((v) => requireOneOf(v, VEHICLE_TYPES, `${id}.vehicleTypes[]`));
  assert(vehicleTypes.length > 0, `${id}.vehicleTypes must not be empty`);
  return {
    id,
    name: nullableString(spot['name'], `${id}.name`),
    nameEn: nullableString(spot['nameEn'], `${id}.nameEn`),
    location: parseLatLng(spot['location'], `${id}.location`),
    source: requireOneOf(spot['source'], SPOT_SOURCES, `${id}.source`),
    vehicleTypes,
    price: parsePrice(spot['price'], `${id}.price`),
    priceNote: nullableString(spot['priceNote'], `${id}.priceNote`),
    capacity: nullableNumber(spot['capacity'], `${id}.capacity`),
    openingHours: nullableString(spot['openingHours'], `${id}.openingHours`),
    isParkAndRide: requireBoolean(spot['isParkAndRide'], `${id}.isParkAndRide`),
    liveStatus: parseLiveStatusSource(spot['liveStatus'], `${id}.liveStatus`),
    nearestStation: {
      name: requireString(station['name'], `${id}.nearestStation.name`),
      distanceMeters: requireNumber(station['distanceMeters'], `${id}.nearestStation.distanceMeters`),
      location: parseLatLng(station['location'], `${id}.nearestStation.location`),
    },
  };
}

function parseAvoidZone(raw: unknown): AvoidZone {
  const zone = requireObject(raw, 'avoid zone');
  const id = requireString(zone['id'], 'zone.id');
  const name = requireObject(zone['name'], `${id}.name`);
  return {
    id,
    name: { en: requireString(name['en'], `${id}.name.en`), he: requireString(name['he'], `${id}.name.he`) },
    rings: requireArray(zone['rings'], `${id}.rings`).map((ring, r) => requireArray(ring, `${id}.rings[${r}]`).map((p) => parseLatLng(p, `${id}.rings[${r}][]`))),
  };
}

export function parseDataset(raw: unknown): ParkingDataset {
  const dataset = requireObject(raw, 'parking dataset');
  return {
    generatedAt: requireString(dataset['generatedAt'], 'dataset.generatedAt'),
    attribution: requireString(dataset['attribution'], 'dataset.attribution'),
    spots: requireArray(dataset['spots'], 'dataset.spots').map(parseParkingSpot),
    avoidZones: requireArray(dataset['avoidZones'], 'dataset.avoidZones').map(parseAvoidZone),
  };
}

export async function loadDataset(): Promise<ParkingDataset> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/parking.json`);
  assert(response.ok, `Could not load parking data (HTTP ${response.status})`);
  return parseDataset(await response.json());
}
