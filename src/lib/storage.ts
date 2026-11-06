// Device-only persistence (no accounts): settings and the parked-vehicle location.
// Stored data is validated on load; invalid data throws so the app can offer a reset.

import { requireArray, requireBoolean, requireNumber, requireObject, requireOneOf, requireString } from './assert.ts';
import { parseLatLng } from './dataset.ts';
import { VEHICLE_TYPES } from './types.ts';
import type { ParkedVehicle, Place, Settings } from './types.ts';

const SETTINGS_KEY = 'parkngo.settings.v1';
const PARKED_KEY = 'parkngo.parked.v1';
const RECENTS_KEY = 'parkngo.recents.v1';
const MAX_RECENTS = 6;

export const DEFAULT_SETTINGS: Settings = {
  language: 'he',
  vehicle: 'car',
  pricePolicy: 'allow_paid',
  maxDailyPriceIls: 20,
  maxWalkMeters: 800,
  avoidZoneIds: ['tel-aviv-yafo'],
  fuelCostPerKmIls: 0.5,
  valueOfTimeIlsPerHour: 40,
  voiceGuidance: true,
};

function parseSettings(raw: unknown): Settings {
  const s = requireObject(raw, 'stored settings');
  return {
    language: requireOneOf(s['language'], ['en', 'he'] as const, 'settings.language'),
    vehicle: requireOneOf(s['vehicle'], VEHICLE_TYPES, 'settings.vehicle'),
    pricePolicy: requireOneOf(s['pricePolicy'], ['free_only', 'allow_paid'] as const, 'settings.pricePolicy'),
    maxDailyPriceIls: requireNumber(s['maxDailyPriceIls'], 'settings.maxDailyPriceIls'),
    maxWalkMeters: requireNumber(s['maxWalkMeters'], 'settings.maxWalkMeters'),
    avoidZoneIds: requireArray(s['avoidZoneIds'], 'settings.avoidZoneIds').map((id) => requireString(id, 'settings.avoidZoneIds[]')),
    fuelCostPerKmIls: requireNumber(s['fuelCostPerKmIls'], 'settings.fuelCostPerKmIls'),
    valueOfTimeIlsPerHour: requireNumber(s['valueOfTimeIlsPerHour'], 'settings.valueOfTimeIlsPerHour'),
    voiceGuidance: requireBoolean(s['voiceGuidance'], 'settings.voiceGuidance'),
  };
}

function browserLanguage(): Settings['language'] {
  return navigator.language.toLowerCase().startsWith('he') ? 'he' : 'en';
}

export function loadSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored === null ? { ...DEFAULT_SETTINGS, language: browserLanguage() } : parseSettings(JSON.parse(stored));
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadParkedVehicle(): ParkedVehicle | null {
  const stored = localStorage.getItem(PARKED_KEY);
  if (stored === null) {
    return null;
  }
  const raw = requireObject(JSON.parse(stored), 'stored parked vehicle');
  return {
    location: parseLatLng(raw['location'], 'parked.location'),
    label: requireString(raw['label'], 'parked.label'),
    savedAt: requireString(raw['savedAt'], 'parked.savedAt'),
  };
}

export function saveParkedVehicle(parked: ParkedVehicle | null): void {
  if (parked === null) {
    localStorage.removeItem(PARKED_KEY);
  } else {
    localStorage.setItem(PARKED_KEY, JSON.stringify(parked));
  }
}

export function loadRecentPlaces(): Place[] {
  const stored = localStorage.getItem(RECENTS_KEY);
  if (stored === null) {
    return [];
  }
  return requireArray(JSON.parse(stored), 'stored recent places').map((raw, index) => {
    const place = requireObject(raw, `recent place ${index}`);
    return { name: requireString(place['name'], `recent place ${index}.name`), location: parseLatLng(place['location'], `recent place ${index}.location`) };
  });
}

/** Puts `place` first in the recent list (deduplicated by name), keeping at most MAX_RECENTS. */
export function withRecentPlace(recents: Place[], place: Place): Place[] {
  return [place, ...recents.filter((p) => p.name !== place.name)].slice(0, MAX_RECENTS);
}

export function saveRecentPlaces(recents: Place[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

/** Removes all ParkNGo data from this device (used to recover from invalid stored data). */
export function clearAllStoredData(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PARKED_KEY);
  localStorage.removeItem(RECENTS_KEY);
}
