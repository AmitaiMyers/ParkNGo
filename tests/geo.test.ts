import { describe, expect, it } from 'vitest';
import { bearingDegrees, bearingDelta, cumulativeDistances, decodePolyline, haversineMeters, isPointInRing, projectOntoRoute } from '../src/lib/geo.ts';

describe('haversineMeters', () => {
  it('measures ~13.7 km between Ra’anana and Azrieli', () => {
    const d = haversineMeters({ lat: 32.1848, lng: 34.8713 }, { lat: 32.0744, lng: 34.7925 });
    expect(d).toBeGreaterThan(14_000);
    expect(d).toBeLessThan(14_500);
  });
});

describe('bearings', () => {
  it('north is 0 and east is 90', () => {
    expect(bearingDegrees({ lat: 32, lng: 34.8 }, { lat: 32.01, lng: 34.8 })).toBeCloseTo(0, 1);
    expect(bearingDegrees({ lat: 32, lng: 34.8 }, { lat: 32, lng: 34.81 })).toBeCloseTo(90, 0);
  });

  it('bearingDelta is signed and wraps around north', () => {
    expect(bearingDelta(350, 10)).toBe(20);
    expect(bearingDelta(10, 350)).toBe(-20);
    expect(bearingDelta(0, 180)).toBe(180);
  });
});

describe('decodePolyline', () => {
  it('decodes the reference Google example at precision 5', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(points).toHaveLength(3);
    expect(points[0]!.lat).toBeCloseTo(38.5, 5);
    expect(points[0]!.lng).toBeCloseTo(-120.2, 5);
    expect(points[2]!.lat).toBeCloseTo(43.252, 5);
    expect(points[2]!.lng).toBeCloseTo(-126.453, 5);
  });

  it('throws on truncated input', () => {
    expect(() => decodePolyline('_p~iF~ps|U_', 5)).toThrow(/Malformed/);
  });
});

describe('isPointInRing', () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];
  it('detects inside and outside points', () => {
    expect(isPointInRing({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
    expect(isPointInRing({ lat: 1.5, lng: 0.5 }, square)).toBe(false);
  });
});

describe('projectOntoRoute', () => {
  const route = [
    { lat: 32.0, lng: 34.8 },
    { lat: 32.0, lng: 34.81 },
  ];
  const cumulative = cumulativeDistances(route);

  it('reports progress along the route and lateral offset', () => {
    const projection = projectOntoRoute({ lat: 32.0005, lng: 34.805 }, route, cumulative);
    expect(projection.offsetMeters).toBeGreaterThan(50);
    expect(projection.offsetMeters).toBeLessThan(60);
    expect(projection.progressMeters).toBeCloseTo(cumulative[1]! / 2, -1);
  });
});
