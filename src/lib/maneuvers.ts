// Turn-by-turn instructions for the vehicle leg.
// Transitous returns street "steps" but labels every one of them CONTINUE, so the
// actual turns are derived here from the geometry (bearing change between steps)
// and from street-name changes.

import { bearingDegrees, bearingDelta, cumulativeDistances, haversineMeters } from './geo.ts';
import type { RouteStep } from './transitous.ts';
import type { LatLng } from './types.ts';

export type ManeuverType =
  | 'depart'
  | 'continue'
  | 'slight_left'
  | 'slight_right'
  | 'left'
  | 'right'
  | 'sharp_left'
  | 'sharp_right'
  | 'uturn'
  | 'arrive';

export interface Maneuver {
  type: ManeuverType;
  /** Street to follow after the maneuver; '' when unnamed. */
  streetName: string;
  location: LatLng;
  distanceFromStartMeters: number;
}

/** Turns smaller than this (degrees) only produce an instruction when the street name changes. */
const TURN_THRESHOLD_DEGREES = 40;
/** Maneuvers closer than this are merged (e.g. the many small steps of a roundabout). */
const MERGE_DISTANCE_METERS = 30;
/** Length used to measure a stable bearing at each end of a step. */
const BEARING_SAMPLE_METERS = 15;

export function classifyTurn(delta: number): ManeuverType {
  const magnitude = Math.abs(delta);
  const side = delta > 0 ? 'right' : 'left';
  if (magnitude < 15) return 'continue';
  if (magnitude < TURN_THRESHOLD_DEGREES) return side === 'right' ? 'slight_right' : 'slight_left';
  if (magnitude < 120) return side;
  if (magnitude < 165) return side === 'right' ? 'sharp_right' : 'sharp_left';
  return 'uturn';
}

/** Bearing over roughly the last BEARING_SAMPLE_METERS of a polyline. */
function endBearing(points: LatLng[]): number {
  const end = points[points.length - 1]!;
  let index = points.length - 2;
  while (index > 0 && haversineMeters(points[index]!, end) < BEARING_SAMPLE_METERS) {
    index--;
  }
  return bearingDegrees(points[index]!, end);
}

/** Bearing over roughly the first BEARING_SAMPLE_METERS of a polyline. */
function startBearing(points: LatLng[]): number {
  const start = points[0]!;
  let index = 1;
  while (index < points.length - 1 && haversineMeters(start, points[index]!) < BEARING_SAMPLE_METERS) {
    index++;
  }
  return bearingDegrees(start, points[index]!);
}

const stepLength = (step: RouteStep): number => {
  const cumulative = cumulativeDistances(step.points);
  return cumulative[cumulative.length - 1]!;
};

interface PendingTurn {
  maneuver: Maneuver;
  delta: number;
}

export function buildManeuvers(steps: RouteStep[]): Maneuver[] {
  const usable = steps.filter((step) => step.points.length >= 2);
  const first = usable[0];
  const last = usable[usable.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('buildManeuvers needs at least one step with geometry');
  }

  const firstNamed = usable.find((step) => step.streetName !== '');
  const depart: Maneuver = { type: 'depart', streetName: firstNamed === undefined ? '' : firstNamed.streetName, location: first.points[0]!, distanceFromStartMeters: 0 };

  const turns: PendingTurn[] = [];
  let currentStreet = depart.streetName;
  let travelled = stepLength(first);

  for (let i = 1; i < usable.length; i++) {
    const previous = usable[i - 1]!;
    const step = usable[i]!;
    const delta = bearingDelta(endBearing(previous.points), startBearing(step.points));
    const nameChanged = step.streetName !== '' && step.streetName !== currentStreet;
    const isTurn = Math.abs(delta) >= TURN_THRESHOLD_DEGREES;

    if (isTurn || nameChanged) {
      const maneuver: Maneuver = { type: classifyTurn(delta), streetName: step.streetName, location: step.points[0]!, distanceFromStartMeters: travelled };
      const previousTurn = turns[turns.length - 1];
      if (previousTurn !== undefined && travelled - previousTurn.maneuver.distanceFromStartMeters < MERGE_DISTANCE_METERS) {
        // Net heading change across the merged steps, normalized to (-180, 180].
        const combinedDelta = bearingDelta(0, previousTurn.delta + delta);
        previousTurn.delta = combinedDelta;
        previousTurn.maneuver = { ...previousTurn.maneuver, type: classifyTurn(combinedDelta), streetName: step.streetName === '' ? previousTurn.maneuver.streetName : step.streetName };
      } else {
        turns.push({ maneuver, delta });
      }
    }
    if (step.streetName !== '') {
      currentStreet = step.streetName;
    }
    travelled += stepLength(step);
  }

  const arrive: Maneuver = { type: 'arrive', streetName: '', location: last.points[last.points.length - 1]!, distanceFromStartMeters: travelled };
  const meaningful = turns.map((turn) => turn.maneuver).filter((m) => !(m.type === 'continue' && m.streetName === ''));
  return [depart, ...meaningful, arrive];
}

/** Index of the next maneuver the driver has not passed yet. */
export function nextManeuverIndex(maneuvers: Maneuver[], progressMeters: number): number {
  const index = maneuvers.findIndex((m, i) => i > 0 && m.distanceFromStartMeters > progressMeters);
  return index === -1 ? maneuvers.length - 1 : index;
}
