import { describe, expect, it } from 'vitest';
import { splitIntoSegments } from '../src/lib/segments.ts';
import { makeLeg } from './fixtures.ts';

const P = { lat: 32, lng: 34.8 };
const t0 = new Date('2026-11-08T06:00:00Z');
const leg = (mode: string) => makeLeg(mode, P, P, t0, 5, mode === 'WALK' || mode === 'CAR' || mode === 'BIKE' ? 500 : null);
const kinds = (modes: string[]) => splitIntoSegments(modes.map(leg)).map((s) => `${s.kind}:${s.legs.map((l) => l.mode).join('+')}`);

describe('splitIntoSegments', () => {
  it('park & ride: drive, then walks and transit together', () => {
    expect(kinds(['CAR', 'WALK', 'RAIL', 'WALK'])).toEqual(['street:CAR', 'transit:WALK+RAIL+WALK']);
  });

  it('carry-on: ride, transit, then the final ride gets its own street segment', () => {
    expect(kinds(['BIKE', 'BUS', 'WALK', 'BUS', 'BIKE'])).toEqual(['street:BIKE', 'transit:BUS+WALK+BUS', 'street:BIKE']);
  });

  it('vehicle only and transit only', () => {
    expect(kinds(['CAR'])).toEqual(['street:CAR']);
    expect(kinds(['WALK', 'BUS', 'WALK'])).toEqual(['transit:WALK+BUS+WALK']);
  });
});
