import { describe, expect, it } from 'vitest';
import { formatArrival, translate } from '../src/lib/i18n.ts';

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
