import type { LatLng } from './types.ts';

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Initial compass bearing from a to b, in degrees [0, 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Signed difference between two bearings, in (-180, 180]. Positive = clockwise (right turn). */
export function bearingDelta(fromBearing: number, toBearing: number): number {
  const delta = (((toBearing - fromBearing) % 360) + 360) % 360;
  return delta > 180 ? delta - 360 : delta;
}

/** Decodes a Google encoded polyline with the given precision (5 = Google default, 6 = OSRM/MOTIS). */
export function decodePolyline(encoded: string, precision: number): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) {
        throw new Error('Malformed polyline: unexpected end of input');
      }
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += readValue();
    lng += readValue();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** Ray-casting point-in-polygon test for a single ring. */
export function isPointInRing(point: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const crosses = a.lat > point.lat !== b.lat > point.lat && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/** Cumulative distance along a polyline: result[i] = meters from the first point to point i. */
export function cumulativeDistances(points: LatLng[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    result.push(result[i - 1]! + haversineMeters(points[i - 1]!, points[i]!));
  }
  return result;
}

export interface RouteProjection {
  /** Distance from the point to the closest position on the route. */
  offsetMeters: number;
  /** Distance travelled along the route up to that closest position. */
  progressMeters: number;
}

/**
 * Projects a point onto a polyline. Uses a local equirectangular projection,
 * which is accurate enough for the short segments of a street route.
 */
export function projectOntoRoute(point: LatLng, route: LatLng[], cumulative: number[]): RouteProjection {
  if (route.length < 2) {
    throw new Error('projectOntoRoute requires a route with at least two points');
  }
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(toRadians(point.lat));
  const toXY = (p: LatLng) => ({ x: (p.lng - point.lng) * metersPerDegLng, y: (p.lat - point.lat) * metersPerDegLat });

  let best: RouteProjection = { offsetMeters: Number.POSITIVE_INFINITY, progressMeters: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i]!);
    const b = toXY(route[i + 1]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const offset = Math.hypot(px, py);
    if (offset < best.offsetMeters) {
      const segmentLength = cumulative[i + 1]! - cumulative[i]!;
      best = { offsetMeters: offset, progressMeters: cumulative[i]! + t * segmentLength };
    }
  }
  return best;
}

export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}
