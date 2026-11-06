import { describe, expect, it } from 'vitest';
import { buildManeuvers, classifyTurn, nextManeuverIndex } from '../src/lib/maneuvers.ts';
import type { RouteStep } from '../src/lib/transitous.ts';
import type { LatLng } from '../src/lib/types.ts';

// ~111 m per 0.001° latitude; ~94 m per 0.001° longitude at 32°N.
const step = (streetName: string, points: LatLng[]): RouteStep => ({ streetName, distanceMeters: 0, points });

describe('classifyTurn', () => {
  it('maps bearing deltas to maneuver types', () => {
    expect(classifyTurn(5)).toBe('continue');
    expect(classifyTurn(-25)).toBe('slight_left');
    expect(classifyTurn(90)).toBe('right');
    expect(classifyTurn(-90)).toBe('left');
    expect(classifyTurn(150)).toBe('sharp_right');
    expect(classifyTurn(179)).toBe('uturn');
  });
});

describe('buildManeuvers', () => {
  it('detects a right turn from geometry even though names are unchanged', () => {
    const north = step('Herzl', [
      { lat: 32.0, lng: 34.8 },
      { lat: 32.002, lng: 34.8 },
    ]);
    const east = step('Herzl', [
      { lat: 32.002, lng: 34.8 },
      { lat: 32.002, lng: 34.803 },
    ]);
    const maneuvers = buildManeuvers([north, east]);
    expect(maneuvers.map((m) => m.type)).toEqual(['depart', 'right', 'arrive']);
    expect(maneuvers[1]!.distanceFromStartMeters).toBeCloseTo(222, -1);
  });

  it('announces a straight continuation only when the street name changes', () => {
    const a = step('Weizmann', [
      { lat: 32.0, lng: 34.8 },
      { lat: 32.002, lng: 34.8 },
    ]);
    const b = step('Weizmann', [
      { lat: 32.002, lng: 34.8 },
      { lat: 32.004, lng: 34.8 },
    ]);
    const c = step('Ahuza', [
      { lat: 32.004, lng: 34.8 },
      { lat: 32.006, lng: 34.8 },
    ]);
    const maneuvers = buildManeuvers([a, b, c]);
    expect(maneuvers.map((m) => [m.type, m.streetName])).toEqual([
      ['depart', 'Weizmann'],
      ['continue', 'Ahuza'],
      ['arrive', ''],
    ]);
  });

  it('merges maneuvers that are very close together (roundabouts)', () => {
    const approach = step('A', [
      { lat: 32.0, lng: 34.8 },
      { lat: 32.002, lng: 34.8 },
    ]);
    // Two consecutive 45° right turns within ~20 m → one combined right turn.
    const r1 = step('Roundabout', [
      { lat: 32.002, lng: 34.8 },
      { lat: 32.0021, lng: 34.8001 },
    ]);
    const exit = step('B', [
      { lat: 32.0021, lng: 34.8001 },
      { lat: 32.0021, lng: 34.803 },
    ]);
    const types = buildManeuvers([approach, r1, exit]).map((m) => m.type);
    expect(types).toEqual(['depart', 'right', 'arrive']);
  });

  it('normalizes the net heading of merged zig-zag steps (real junction: E → N → W → S is a right turn)', () => {
    const east = step('Ahuza', [
      { lat: 32.0, lng: 34.8 },
      { lat: 32.0, lng: 34.803 },
    ]);
    const north = step('', [
      { lat: 32.0, lng: 34.803 },
      { lat: 32.0001, lng: 34.803 },
    ]);
    const west = step('', [
      { lat: 32.0001, lng: 34.803 },
      { lat: 32.0001, lng: 34.8029 },
    ]);
    const south = step('Geha', [
      { lat: 32.0001, lng: 34.8029 },
      { lat: 31.998, lng: 34.8029 },
    ]);
    const maneuvers = buildManeuvers([east, north, west, south]);
    expect(maneuvers.map((m) => [m.type, m.streetName])).toEqual([
      ['depart', 'Ahuza'],
      ['right', 'Geha'],
      ['arrive', ''],
    ]);
  });

  it('rejects an empty step list', () => {
    expect(() => buildManeuvers([])).toThrow(/at least one step/);
  });
});

describe('nextManeuverIndex', () => {
  it('returns the first maneuver ahead of the current progress', () => {
    const at = (d: number) => ({ type: 'right' as const, streetName: '', location: { lat: 0, lng: 0 }, distanceFromStartMeters: d });
    const maneuvers = [at(0), at(100), at(300), at(500)];
    expect(nextManeuverIndex(maneuvers, 0)).toBe(1);
    expect(nextManeuverIndex(maneuvers, 150)).toBe(2);
    expect(nextManeuverIndex(maneuvers, 900)).toBe(3);
  });
});
