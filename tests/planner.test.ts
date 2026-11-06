import { describe, expect, it } from 'vitest';
import { buildOption, filterCandidates, generalizedCost, isPriceAccepted, pickHighlights, planTrip } from '../src/lib/planner.ts';
import type { RoutingApi } from '../src/lib/transitous.ts';
import type { AvoidZone, LatLng } from '../src/lib/types.ts';
import { itineraryOf, makeLeg, makeRequest, makeSpot, settings } from './fixtures.ts';

const ON_THE_WAY: LatLng = { lat: 32.13, lng: 34.84 }; // between Ra'anana and Tel Aviv
const FAR_AWAY: LatLng = { lat: 31.8, lng: 34.65 }; // Ashdod direction
const RAANANA_POINT: LatLng = { lat: 32.1848, lng: 34.8713 };
const AZRIELI_POINT: LatLng = { lat: 32.0744, lng: 34.7925 };

describe('isPriceAccepted', () => {
  const free = makeSpot({ id: 'free', location: ON_THE_WAY });
  const cheap = makeSpot({ id: 'cheap', location: ON_THE_WAY, price: { type: 'paid', dailyIls: 10 } });
  const pricey = makeSpot({ id: 'pricey', location: ON_THE_WAY, price: { type: 'paid', dailyIls: 60 } });
  const unknown = makeSpot({ id: 'unknown', location: ON_THE_WAY, price: { type: 'unknown' } });

  it('free_only accepts only free spots', () => {
    const s = { ...settings, pricePolicy: 'free_only' as const };
    expect([free, cheap, pricey, unknown].filter((spot) => isPriceAccepted(spot, s)).map((x) => x.id)).toEqual(['free']);
  });

  it('allow_paid accepts spots up to the maximum, and unknown prices', () => {
    const s = { ...settings, pricePolicy: 'allow_paid' as const, maxDailyPriceIls: 20 };
    expect([free, cheap, pricey, unknown].filter((spot) => isPriceAccepted(spot, s)).map((x) => x.id)).toEqual(['free', 'cheap', 'unknown']);
  });
});

describe('filterCandidates', () => {
  const request = makeRequest();

  it('drops spots outside the detour ellipse, too far from a station, or for another vehicle', () => {
    const spots = [
      makeSpot({ id: 'good', location: ON_THE_WAY }),
      makeSpot({ id: 'far', location: FAR_AWAY }),
      makeSpot({ id: 'long-walk', location: ON_THE_WAY, nearestStation: { name: 'S', distanceMeters: 2000, location: ON_THE_WAY } }),
      makeSpot({ id: 'bike-rack', location: ON_THE_WAY, vehicleTypes: ['bicycle', 'scooter'] }),
    ];
    expect(filterCandidates(spots, request, settings, []).map((s) => s.id)).toEqual(['good']);
  });

  it('drops spots inside an avoided zone only when that zone is selected', () => {
    const zone: AvoidZone = {
      id: 'zone',
      name: { en: 'Z', he: 'Z' },
      rings: [[
        { lat: 32.12, lng: 34.83 },
        { lat: 32.12, lng: 34.85 },
        { lat: 32.14, lng: 34.85 },
        { lat: 32.14, lng: 34.83 },
      ]],
    };
    const spots = [makeSpot({ id: 'inside', location: ON_THE_WAY })];
    expect(filterCandidates(spots, request, settings, [zone])).toHaveLength(1);
    expect(filterCandidates(spots, request, { ...settings, avoidZoneIds: ['zone'] }, [zone])).toHaveLength(0);
  });
});

describe('generalizedCost', () => {
  it('converts money to minutes using the value of time and assumes the max price when unknown', () => {
    const s = { ...settings, valueOfTimeIlsPerHour: 60, maxDailyPriceIls: 20 };
    const base = { totalMinutes: 30, walkMinutes: 0, transfers: 0, fuelCostIls: 0 };
    expect(generalizedCost({ ...base, parkingCostIls: 0 }, s)).toBe(30);
    expect(generalizedCost({ ...base, parkingCostIls: null }, s)).toBe(50);
  });
});

describe('planTrip', () => {
  const departure = new Date('2026-11-08T07:00:00Z');
  const request = makeRequest({ departure });
  const nearSpot = makeSpot({ id: 'near', location: ON_THE_WAY, price: { type: 'free' } });
  const paidSpot = makeSpot({ id: 'paid', location: { lat: 32.11, lng: 34.83 }, price: { type: 'paid', dailyIls: 15 } });

  const fakeApi: RoutingApi = {
    streetDurations: async (_origin, targets) => targets.map(() => 900),
    streetRoute: async (from, to, _vehicle, time) => itineraryOf([makeLeg('CAR', from, to, time, 15, 9000)], 0),
    transitRoutes: async (from, to, time) => {
      const minutes = from.lat === nearSpot.location.lat ? 35 : 20;
      return [itineraryOf([makeLeg('WALK', from, from, time, 4, 300), makeLeg('RAIL', from, to, new Date(time.getTime() + 4 * 60_000), minutes, null)], 0)];
    },
  };

  it('returns highlighted park-and-ride options plus both baselines', async () => {
    const result = await planTrip(request, settings, [nearSpot, paidSpot], [], fakeApi);
    expect(result.candidatesConsidered).toBe(2);
    expect(result.options).toHaveLength(2);
    expect(result.highlights!.fastest.spot!.id).toBe('paid');
    expect(result.highlights!.cheapest.spot!.id).toBe('near');
    expect(result.vehicleOnly!.kind).toBe('vehicle_only');
    expect(result.transitOnly!.kind).toBe('transit_only');
    expect(result.options[0]!.legs.map((l) => l.mode)).toEqual(['CAR', 'WALK', 'RAIL']);
  });

  it('returns no highlights when there is no candidate', async () => {
    const result = await planTrip(request, settings, [], [], fakeApi);
    expect(result.options).toEqual([]);
    expect(result.highlights).toBeNull();
  });

  it('pickHighlights returns null when there are no options', () => {
    expect(pickHighlights([])).toBeNull();
  });
});

describe('pickHighlights', () => {
  const request = makeRequest();
  const start = request.departure;
  const optionVia = (id: string, price: number | null, carMeters: number, transitMinutes: number) => {
    const spot = makeSpot({ id, location: ON_THE_WAY, price: price === null ? { type: 'unknown' } : price === 0 ? { type: 'free' } : { type: 'paid', dailyIls: price } });
    const car = makeLeg('CAR', RAANANA_POINT, ON_THE_WAY, start, 15, carMeters);
    const rail = makeLeg('RAIL', ON_THE_WAY, AZRIELI_POINT, car.endTime, transitMinutes, null);
    return buildOption('park_and_ride', spot, [car, rail], 0, request, settings);
  };

  it('cheapest = lowest parking price, not a much slower trip that saves a little fuel', () => {
    const quickFree = optionVia('quick-free', 0, 12_000, 20);
    const slowFreeLessFuel = optionVia('slow-free', 0, 9_000, 120);
    const paid = optionVia('paid', 10, 12_000, 10);
    const highlights = pickHighlights([quickFree, slowFreeLessFuel, paid])!;
    expect(highlights.cheapest.spot!.id).toBe('quick-free');
    expect(highlights.fastest.spot!.id).toBe('paid');
  });

  it('unknown prices never win cheapest when a known price exists', () => {
    const unknown = optionVia('unknown', null, 12_000, 20);
    const paid = optionVia('paid', 15, 12_000, 30);
    expect(pickHighlights([unknown, paid])!.cheapest.spot!.id).toBe('paid');
  });
});
