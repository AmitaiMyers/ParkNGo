// Groups the many GTFS/MOTIS modes into the five the UI shows, with one icon and color each.

import { Bike, Bus, Car, Footprints, TramFront, TrainFront } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Scooter } from './ScooterIcon.tsx';
import type { RouteLeg } from '../lib/transitous.ts';
import type { VehicleType } from '../lib/types.ts';

export type ModeGroup = 'vehicle' | 'walk' | 'rail' | 'lrt' | 'bus';

const RAIL_MODES = new Set(['RAIL', 'REGIONAL_RAIL', 'SUBURBAN', 'HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_FAST_RAIL']);
const LIGHT_RAIL_MODES = new Set(['TRAM', 'SUBWAY', 'METRO', 'FUNICULAR', 'CABLE_CAR', 'AERIAL_LIFT']);

export function modeGroup(mode: string): ModeGroup {
  if (mode === 'CAR' || mode === 'BIKE') return 'vehicle';
  if (mode === 'WALK') return 'walk';
  if (RAIL_MODES.has(mode)) return 'rail';
  if (LIGHT_RAIL_MODES.has(mode)) return 'lrt';
  return 'bus';
}

export const VEHICLE_ICONS: Record<VehicleType, LucideIcon> = { car: Car, bicycle: Bike, scooter: Scooter };

export function modeIcon(group: ModeGroup, vehicle: VehicleType): LucideIcon {
  switch (group) {
    case 'vehicle':
      return VEHICLE_ICONS[vehicle];
    case 'walk':
      return Footprints;
    case 'rail':
      return TrainFront;
    case 'lrt':
      return TramFront;
    case 'bus':
      return Bus;
  }
}

/** CSS custom property holding the color of each group (tokens.css). */
export const MODE_COLOR_TOKEN: Record<ModeGroup, string> = {
  vehicle: '--mode-vehicle',
  walk: '--mode-walk',
  rail: '--mode-rail',
  lrt: '--mode-lrt',
  bus: '--mode-bus',
};

export const legGroups = (legs: RouteLeg[]): ModeGroup[] => legs.map((leg) => modeGroup(leg.mode));
