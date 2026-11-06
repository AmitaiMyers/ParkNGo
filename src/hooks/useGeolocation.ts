import { useEffect, useState } from 'react';
import type { LatLng } from '../lib/types.ts';

const toLatLng = (position: GeolocationPosition): LatLng => ({ lat: position.coords.latitude, lng: position.coords.longitude });

/** One position fix; rejects with the browser's message (e.g. permission denied). */
export function currentLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toLatLng(position)),
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

/** Continuous position updates while the component is mounted. */
export function useWatchedPosition(): { position: LatLng | null; error: string | null } {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (next) => {
        setPosition(toLatLng(next));
        setError(null);
      },
      (failure) => setError(failure.message),
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  return { position, error };
}
