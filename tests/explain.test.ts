import { describe, expect, it } from 'vitest';
import { explainOption } from '../src/features/results/explain.ts';
import { makeTranslator } from '../src/lib/i18n.ts';
import { buildOption } from '../src/lib/planner.ts';
import type { PlanResult } from '../src/lib/planner.ts';
import { makeLeg, makeRequest, makeSpot, settings } from './fixtures.ts';

const t = makeTranslator('en');
const request = makeRequest();
const A = request.origin.location;
const P = { lat: 32.1, lng: 34.8 };
const B = request.destination.location;

function parkAndRide(transitMinutes: number, isParkAndRide: boolean) {
  const car = makeLeg('CAR', A, P, request.departure, 15, 9000);
  const walk = makeLeg('WALK', P, P, car.endTime, 4, 300);
  const rail = { ...makeLeg('RAIL', P, B, walk.endTime, transitMinutes, null), fromName: 'Reading Terminal' };
  return buildOption('park_and_ride', makeSpot({ id: 'p', location: P, isParkAndRide }), [car, walk, rail], 0, request, settings);
}

const resultWithTransitMinutes = (minutes: number | null): PlanResult =>
  ({ transitOnly: minutes === null ? null : buildOption('transit_only', null, [makeLeg('BUS', A, B, request.departure, minutes, null)], 1, request, settings) }) as PlanResult;

describe('explainOption', () => {
  it('names the price, the walk to the first stop and the gain over public transport', () => {
    expect(explainOption(parkAndRide(10, false), resultWithTransitMinutes(41), t).join(' · ')).toBe('Free · 4 min walk to Reading Terminal · 12 min faster than public transport');
  });

  it('prefers "Official park & ride", and is honest when slower', () => {
    expect(explainOption(parkAndRide(30, true), resultWithTransitMinutes(40), t).join(' · ')).toBe(
      'Official park & ride · 4 min walk to Reading Terminal · 9 min slower than public transport, but no traffic in the city',
    );
  });

  it('says when there is no public-transport-only alternative', () => {
    expect(explainOption(parkAndRide(10, false), resultWithTransitMinutes(null), t).join(' · ')).toContain('No public-transport-only alternative');
  });
});
