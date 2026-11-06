// Sunrise / sunset (NOAA "sunrise equation"), used to switch navigation to dark mode at night.
// Accurate to a few minutes, which is all a theme switch needs.

import type { LatLng } from './types.ts';

const DAY_MS = 86_400_000;
const JULIAN_UNIX_EPOCH = 2440587.5;
const J2000 = 2451545.0;
const OBLIQUITY = 23.4397;
/** Sun's apparent radius + refraction: sunrise/sunset is when the center is 0.833° below the horizon. */
const HORIZON_DEGREES = -0.833;

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;
const toJulian = (date: Date): number => date.getTime() / DAY_MS + JULIAN_UNIX_EPOCH;
const fromJulian = (julian: number): Date => new Date((julian - JULIAN_UNIX_EPOCH) * DAY_MS);

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/** Sunrise and sunset of the solar day containing `date` at `location` (outside polar day/night). */
export function sunTimes(date: Date, location: LatLng): SunTimes {
  // Mean solar noon of the local solar day (east longitudes are positive).
  const dayNumber = Math.round(toJulian(date) - J2000 - location.lng / 360);
  const meanNoon = dayNumber - location.lng / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const center = 1.9148 * Math.sin(rad(anomaly)) + 0.02 * Math.sin(rad(2 * anomaly)) + 0.0003 * Math.sin(rad(3 * anomaly));
  const eclipticLongitude = (anomaly + center + 180 + 102.9372) % 360;
  const transit = J2000 + meanNoon + 0.0053 * Math.sin(rad(anomaly)) - 0.0069 * Math.sin(rad(2 * eclipticLongitude));
  const declination = Math.asin(Math.sin(rad(eclipticLongitude)) * Math.sin(rad(OBLIQUITY)));
  const cosHourAngle =
    (Math.sin(rad(HORIZON_DEGREES)) - Math.sin(rad(location.lat)) * Math.sin(declination)) / (Math.cos(rad(location.lat)) * Math.cos(declination));
  if (cosHourAngle < -1 || cosHourAngle > 1) {
    throw new Error('sunTimes does not support polar day or polar night');
  }
  const hourAngle = deg(Math.acos(cosHourAngle));
  return { sunrise: fromJulian(transit - hourAngle / 360), sunset: fromJulian(transit + hourAngle / 360) };
}

export function isNight(date: Date, location: LatLng): boolean {
  const { sunrise, sunset } = sunTimes(date, location);
  return date < sunrise || date > sunset;
}
