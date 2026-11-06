// The "Why this?" line on an option card, e.g. "Free · 4 min walk to Reading Terminal · 12 min faster than public transport".

import type { Translate } from '../../lib/i18n.ts';
import type { PlanResult, TripOption } from '../../lib/planner.ts';

const VEHICLE_MODES = new Set(['CAR', 'BIKE']);

function walkToFirstStop(option: TripOption, t: Translate): string | null {
  const afterVehicle = option.legs.findIndex((leg) => !VEHICLE_MODES.has(leg.mode));
  const walk = option.legs[afterVehicle];
  const transit = option.legs.find((leg) => leg.isTransit);
  if (walk === undefined || walk.mode !== 'WALK' || transit === undefined) {
    return null;
  }
  return t('why_walk', { n: Math.max(1, Math.round(walk.durationSeconds / 60)), station: transit.fromName });
}

function comparedWithTransit(option: TripOption, result: PlanResult, t: Translate): string | null {
  if (result.transitOnly === null) {
    return t('why_noTransit');
  }
  const difference = Math.round(result.transitOnly.totalMinutes - option.totalMinutes);
  if (difference >= 1) {
    return t('why_faster', { n: difference });
  }
  if (difference <= -1) {
    return t('why_slower', { n: -difference });
  }
  return null;
}

/** The reasons as separate parts; the card shows each in its own <bdi> so mixed Hebrew/English stays in order. */
export function explainOption(option: TripOption, result: PlanResult, t: Translate): string[] {
  if (option.spot === null) {
    throw new Error('explainOption is for park-and-ride options');
  }
  const price = option.spot.isParkAndRide ? t('why_parkAndRide') : option.spot.price.type === 'free' ? t('why_free') : null;
  return [price, walkToFirstStop(option, t), comparedWithTransit(option, result, t)].filter((part): part is string => part !== null);
}
