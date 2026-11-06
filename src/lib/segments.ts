// Splits a trip into navigation segments: street segments (drive / ride, with turn-by-turn)
// and transit segments (walks + public transport, shown as steps).
//   park & ride:  [street(drive), transit]
//   carry-on:     [street(ride), transit, street(ride)]
//   vehicle only: [street]
//   transit only: [transit]

import type { RouteLeg } from './transitous.ts';

const STREET_VEHICLE_MODES = new Set(['CAR', 'BIKE']);

export type SegmentKind = 'street' | 'transit';

export interface NavigationSegment {
  kind: SegmentKind;
  legs: RouteLeg[];
}

export function splitIntoSegments(legs: RouteLeg[]): NavigationSegment[] {
  const segments: NavigationSegment[] = [];
  for (const leg of legs) {
    const kind: SegmentKind = STREET_VEHICLE_MODES.has(leg.mode) ? 'street' : 'transit';
    const current = segments[segments.length - 1];
    if (current !== undefined && current.kind === kind) {
      current.legs.push(leg);
    } else {
      segments.push({ kind, legs: [leg] });
    }
  }
  return segments;
}
