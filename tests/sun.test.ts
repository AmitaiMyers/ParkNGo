import { describe, expect, it } from 'vitest';
import { isNight, sunTimes } from '../src/lib/sun.ts';

const TEL_AVIV = { lat: 32.08, lng: 34.78 };
const minutesOfDayUtc = (date: Date) => date.getUTCHours() * 60 + date.getUTCMinutes();

describe('sunTimes (Tel Aviv)', () => {
  // Reference values (timeanddate.com, Tel Aviv): 6 Nov 2026 ≈ 06:05 / 16:50 IST (UTC+2);
  // 21 Jun 2026 ≈ 05:33 / 19:48 IDT (UTC+3).
  it('matches published sunrise and sunset within 5 minutes', () => {
    const november = sunTimes(new Date('2026-11-06T10:00:00Z'), TEL_AVIV);
    expect(Math.abs(minutesOfDayUtc(november.sunrise) - (4 * 60 + 5))).toBeLessThanOrEqual(5);
    expect(Math.abs(minutesOfDayUtc(november.sunset) - (14 * 60 + 50))).toBeLessThanOrEqual(5);
    const june = sunTimes(new Date('2026-06-21T10:00:00Z'), TEL_AVIV);
    expect(Math.abs(minutesOfDayUtc(june.sunrise) - (2 * 60 + 33))).toBeLessThanOrEqual(5);
    expect(Math.abs(minutesOfDayUtc(june.sunset) - (16 * 60 + 48))).toBeLessThanOrEqual(5);
  });

  it('isNight is false at midday and true late in the evening', () => {
    expect(isNight(new Date('2026-11-06T10:00:00Z'), TEL_AVIV)).toBe(false);
    expect(isNight(new Date('2026-11-06T19:00:00Z'), TEL_AVIV)).toBe(true);
    expect(isNight(new Date('2026-11-06T02:00:00Z'), TEL_AVIV)).toBe(true);
  });
});
