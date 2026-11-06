import { describe, expect, it } from 'vitest';
import { formatArrival, formatHeadsign, translate, translateParts } from '../src/lib/i18n.ts';

describe('formatArrival', () => {
  it('adds the weekday only when arriving on another day', () => {
    const friday = new Date('2026-11-06T13:30:00Z'); // 15:30 in Israel
    expect(formatArrival('en', new Date('2026-11-06T14:00:00Z'), friday)).toBe('16:00');
    expect(formatArrival('en', new Date('2026-11-07T15:36:00Z'), friday)).toBe('Sat 17:36');
  });
});

describe('translate', () => {
  it('fills parameters and fails fast on a missing one', () => {
    expect(translate('en', 'minutes', { n: 5 })).toBe('5 min');
    expect(() => translate('en', 'minutes')).toThrow(/Missing parameter "n"/);
  });
});

describe('singular forms', () => {
  it('uses the _one form when n is 1, in both languages', () => {
    expect(translate('en', 'transfers', { n: 1 })).toBe('1 transfer');
    expect(translate('en', 'transfers', { n: 2 })).toBe('2 transfers');
    expect(translate('he', 'transfers', { n: 1 })).toBe('החלפה אחת');
    expect(translate('en', 'minutes', { n: 1 })).toBe('1 min');
  });
});

describe('translateParts', () => {
  it('separates parameter values so the UI can isolate them', () => {
    expect(translateParts('en', 'walkTo', { place: 'בן גוריון' })).toEqual([
      { kind: 'text', value: 'Walk to ' },
      { kind: 'param', value: 'בן גוריון' },
    ]);
    expect(() => translateParts('en', 'walkTo', {})).toThrow(/Missing parameter/);
  });

  it('formats GTFS headsigns', () => {
    expect(formatHeadsign('תל אביב יפו_אליפלט')).toBe('תל אביב יפו – אליפלט');
  });
});
