import { describe, expect, it } from 'vitest';
import { withRecentPlace } from '../src/lib/storage.ts';

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
