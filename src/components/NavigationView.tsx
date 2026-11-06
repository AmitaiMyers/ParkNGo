import { useEffect, useMemo, useRef, useState } from 'react';
import { cumulativeDistances, projectOntoRoute } from '../lib/geo.ts';
import { formatDistance, formatTime, maneuverText } from '../lib/i18n.ts';
import { buildManeuvers, nextManeuverIndex } from '../lib/maneuvers.ts';
import type { ManeuverType } from '../lib/maneuvers.ts';
import type { TripOption } from '../lib/planner.ts';
import { streetRoute } from '../lib/transitous.ts';
import type { RouteLeg, TransitLine } from '../lib/transitous.ts';
import type { LatLng, ParkedVehicle, Settings, TripRequest } from '../lib/types.ts';
import { googleMapsUrl, spotDisplayName, useI18n, wazeUrl } from '../ui.ts';
import { MapView } from './MapView.tsx';
import type { MapMarker } from './MapView.tsx';

interface Props {
  option: TripOption;
  request: TripRequest;
  settings: Settings;
  onParked: (parked: ParkedVehicle) => void;
  onExit: () => void;
}

const VEHICLE_LEG_MODES = new Set(['CAR', 'BIKE']);
/** Distance from the route that counts as "off route". */
const OFF_ROUTE_METERS = 60;
/** Consecutive off-route GPS fixes before recalculating (filters GPS jitter). */
const OFF_ROUTE_FIXES = 3;
const ANNOUNCE_METERS = { car: 250, bicycle: 60, scooter: 60 } as const;
const ARRIVAL_METERS = 40;

const MANEUVER_ICONS: Record<ManeuverType, string> = {
  depart: '⬆',
  continue: '⬆',
  slight_left: '↖',
  slight_right: '↗',
  left: '⬅',
  right: '➡',
  sharp_left: '↙',
  sharp_right: '↘',
  uturn: '↶',
  arrive: '🅿',
};

function splitLegs(legs: RouteLeg[]): { vehicle: RouteLeg[]; rest: RouteLeg[] } {
  const firstOther = legs.findIndex((leg) => !VEHICLE_LEG_MODES.has(leg.mode));
  const split = firstOther === -1 ? legs.length : firstOther;
  return { vehicle: legs.slice(0, split), rest: legs.slice(split) };
}

function useGeolocation(): { position: LatLng | null; error: string | null } {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setError(null);
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  return { position, error };
}

function speak(text: string, language: Settings['language']): void {
  if (!('speechSynthesis' in window)) {
    return; // Voice is optional; the on-screen banner always shows the instruction.
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'he' ? 'he-IL' : 'en-US';
  window.speechSynthesis.speak(utterance);
}

export function NavigationView({ option, request, settings, onParked, onExit }: Props) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const initial = useMemo(() => splitLegs(option.legs), [option]);
  const [vehicleLegs, setVehicleLegs] = useState<RouteLeg[]>(initial.vehicle);
  const [phase, setPhase] = useState<'vehicle' | 'transit'>(initial.vehicle.length > 0 ? 'vehicle' : 'transit');
  const [rerouting, setRerouting] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const { position, error: gpsError } = useGeolocation();
  const offRouteFixes = useRef(0);
  const spoken = useRef(new Set<string>());

  const spot = option.spot;
  // Where the vehicle phase ends: the parking spot, the boarding stop (carried vehicle), or the destination.
  const lastVehicleLeg = initial.vehicle[initial.vehicle.length - 1];
  const boardingStop = option.kind === 'carry_on' && lastVehicleLeg !== undefined ? lastVehicleLeg : null;
  const vehicleTarget = spot !== null ? spot.location : boardingStop !== null ? boardingStop.to : request.destination.location;
  const targetName = spot !== null ? spotDisplayName(spot, i18n) : boardingStop !== null ? boardingStop.toName : request.destination.name;

  const route = useMemo(() => {
    const points = vehicleLegs.flatMap((leg) => leg.geometry);
    const steps = vehicleLegs.flatMap((leg) => leg.steps);
    return { points, cumulative: cumulativeDistances(points), maneuvers: steps.length === 0 ? [] : buildManeuvers(steps) };
  }, [vehicleLegs]);

  const totalMeters = route.cumulative[route.cumulative.length - 1]!;
  const projection = position !== null && route.points.length >= 2 ? projectOntoRoute(position, route.points, route.cumulative) : null;
  const progress = projection === null ? 0 : projection.progressMeters;
  const nextIndex = route.maneuvers.length === 0 ? -1 : nextManeuverIndex(route.maneuvers, progress);
  const next = nextIndex === -1 ? undefined : route.maneuvers[nextIndex];
  const distanceToNext = next === undefined ? 0 : Math.max(0, next.distanceFromStartMeters - progress);
  const nearTarget = projection !== null && totalMeters - progress < ARRIVAL_METERS;

  // Recalculate the vehicle route after several consecutive off-route GPS fixes.
  // Runs once per GPS fix (position is the trigger); the projection is recomputed here on purpose.
  useEffect(() => {
    if (phase !== 'vehicle' || position === null || rerouting || route.points.length < 2) {
      return;
    }
    const { offsetMeters } = projectOntoRoute(position, route.points, route.cumulative);
    offRouteFixes.current = offsetMeters > OFF_ROUTE_METERS ? offRouteFixes.current + 1 : 0;
    if (offRouteFixes.current < OFF_ROUTE_FIXES) {
      return;
    }
    offRouteFixes.current = 0;
    setRerouting(true);
    streetRoute(position, vehicleTarget, request.vehicle, new Date(), language).then(
      (itinerary) => {
        setRerouting(false);
        if (itinerary !== null) {
          spoken.current.clear();
          setVehicleLegs(itinerary.legs);
        }
      },
      (reason: Error) => {
        setRerouting(false);
        setNavError(reason.message);
      },
    );
    // Intentionally keyed on position only: each new GPS fix is one off-route sample.
  }, [position]);

  // Voice guidance: announce each maneuver once when it gets close (and the first one at start).
  useEffect(() => {
    if (phase !== 'vehicle' || !settings.voiceGuidance || next === undefined) {
      return;
    }
    const first = route.maneuvers[0]!;
    const firstKey = `${first.distanceFromStartMeters}-${first.type}-start`;
    if (!spoken.current.has(firstKey)) {
      spoken.current.add(firstKey);
      speak(maneuverText(t, first.type, first.streetName), language);
      return;
    }
    const key = `${next.distanceFromStartMeters}-${next.type}`;
    if (position !== null && distanceToNext < ANNOUNCE_METERS[request.vehicle] && !spoken.current.has(key)) {
      spoken.current.add(key);
      speak(`${t('inMeters', { distance: formatDistance(language, distanceToNext) })}, ${maneuverText(t, next.type, next.streetName)}`, language);
    }
  }, [phase, settings.voiceGuidance, next, distanceToNext, position, route, request.vehicle, t, language]);

  // A carried bicycle/scooter is never parked, so nothing is remembered for it.
  const carriesVehicle = option.kind === 'carry_on';
  const finishVehicle = () => {
    if (!carriesVehicle) {
      onParked({ location: position === null ? vehicleTarget : position, label: targetName, savedAt: new Date().toISOString() });
    }
    if (initial.rest.length === 0) {
      onExit();
    } else {
      setPhase('transit');
    }
  };

  const mapLegs = phase === 'vehicle' ? vehicleLegs : initial.rest;
  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [{ position: request.destination.location, label: request.destination.name, kind: 'destination' }];
    if (spot !== null) {
      list.push({ position: spot.location, label: targetName, kind: 'parking' });
    }
    if (position !== null) {
      list.push({ position, label: t('myLocation'), kind: 'user' });
    }
    return list;
  }, [request, spot, targetName, position, t]);

  const boardText = (line: TransitLine, mode: string): string => {
    const lineLabel = line.shortName === null ? mode : line.shortName;
    return line.headsign === null ? t('boardLine', { line: lineLabel }) : t('board', { line: lineLabel, headsign: line.headsign });
  };

  const placeName = (name: string, atStart: boolean): string => {
    if (name === 'END') return request.destination.name;
    if (name === 'START' || name === '') return atStart ? targetName : request.destination.name;
    return name;
  };

  return (
    <section className="navigation">
      <div className="nav-banner">
        {phase === 'vehicle' && next !== undefined && (
          <>
            <span className="maneuver-icon" aria-hidden>
              {MANEUVER_ICONS[next.type]}
            </span>
            <div>
              <div className="maneuver-distance">{projection === null ? t('gpsWaiting') : formatDistance(language, distanceToNext)}</div>
              <div className="maneuver-text">{maneuverText(t, next.type, next.streetName)}</div>
            </div>
          </>
        )}
        {phase === 'transit' && <div className="maneuver-text">{t('stepTransit')}</div>}
      </div>
      {rerouting && <p className="warning">{t('offRoute')}</p>}
      {gpsError !== null && <p className="warning">{t('gpsDenied')} ({gpsError})</p>}
      {navError !== null && <p className="error-text">{navError}</p>}

      <MapView className="map map-nav" legs={mapLegs} markers={markers} follow={position} />

      {phase === 'vehicle' && (
        <div className="card">
          <p>
            <strong>{request.vehicle === 'car' ? t('stepDrive') : t('stepRide')}</strong> → {targetName}
          </p>
          <div className="row wrap">
            <button type="button" className={nearTarget ? 'primary' : 'secondary'} onClick={finishVehicle}>
              {initial.rest.length === 0 ? t('arrivedDone') : carriesVehicle ? t('continue') : t('iParked')}
            </button>
            <a className="button secondary" href={wazeUrl(vehicleTarget.lat, vehicleTarget.lng)} target="_blank" rel="noreferrer">
              {t('openInWaze')}
            </a>
            <a
              className="button secondary"
              href={googleMapsUrl(vehicleTarget.lat, vehicleTarget.lng, request.vehicle === 'car' ? 'driving' : 'bicycling')}
              target="_blank"
              rel="noreferrer"
            >
              {t('openInGoogleMaps')}
            </a>
          </div>
        </div>
      )}

      {phase === 'transit' && (
        <div className="card">
          <ol className="transit-steps">
            {initial.rest.map((leg, index) => (
              <li key={`${index}-${leg.mode}`}>
                <span className="time">{formatTime(language, leg.startTime)}</span>
                {leg.line === null ? (
                  <span>
                    {leg.mode === 'BIKE' ? `🚲 ${t('rideTo', { place: placeName(leg.toName, false) })}` : `🚶 ${t('walkTo', { place: placeName(leg.toName, false) })}`} ·{' '}
                    {t('minutes', { n: Math.round(leg.durationSeconds / 60) })}
                  </span>
                ) : (
                  <span>
                    🚆 {boardText(leg.line, leg.mode)} — {placeName(leg.fromName, true)}
                    <br />
                    {t('alightAt', { stop: placeName(leg.toName, false) })} · {formatTime(language, leg.endTime)}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="row wrap">
            <button type="button" className="primary" onClick={onExit}>
              {t('arrivedDone')}
            </button>
            <a
              className="button secondary"
              href={googleMapsUrl(request.destination.location.lat, request.destination.location.lng, 'transit')}
              target="_blank"
              rel="noreferrer"
            >
              {t('openInGoogleMaps')}
            </a>
          </div>
        </div>
      )}

      <button type="button" className="link" onClick={onExit}>
        {t('back')}
      </button>
    </section>
  );
}
