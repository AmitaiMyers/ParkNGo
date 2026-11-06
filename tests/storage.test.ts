import { describe, expect, it } from 'vitest';
import { loadSavedPlaces, saveSavedPlaces, withRecentPlace } from '../src/lib/storage.ts';

const place = (name: string) => ({ name, location: { lat: 32, lng: 34.8 } });

describe('withRecentPlace', () => {
  it('puts the newest first, removes duplicates and keeps six', () => {
    let recents = ['a', 'b', 'c', 'd', 'e', 'f'].map(place);
    recents = withRecentPlace(recents, place('c'));
    expect(recents.map((p) => p.name)).toEqual(['c', 'a', 'b', 'd', 'e', 'f']);
    recents = withRecentPlace(recents, place('g'));
    expect(recents.map((p) => p.name)).toEqual(['g', 'c', 'a', 'b', 'd', 'e']);
  });
});

describe('saved places', () => {
  it('round-trips Home and Work through storage and validates them', () => {
    const store = new Map<string, string>();
    Object.assign(globalThis, {
      localStorage: { getItem: (k: string) => (store.has(k) ? store.get(k)! : null), setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    });
    expect(loadSavedPlaces()).toEqual({ home: null, work: null });
    saveSavedPlaces({ home: place('Home st 1'), work: null });
    expect(loadSavedPlaces()).toEqual({ home: place('Home st 1'), work: null });
    store.set('parkngo.saved.v1', JSON.stringify({ home: { name: 'x' }, work: null }));
    expect(() => loadSavedPlaces()).toThrow(/saved home.location/);
  });
});
