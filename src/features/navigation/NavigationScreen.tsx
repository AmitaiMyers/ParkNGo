import { ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Check, CornerUpLeft, CornerUpRight, Ellipsis, ExternalLink, Flag, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNow, useReducedMotion } from '../../hooks/useEnvironment.ts';
import type { Theme } from '../../hooks/useEnvironment.ts';
import { useWatchedPosition } from '../../hooks/useGeolocation.ts';
import { cumulativeDistances, projectOntoRoute } from '../../lib/geo.ts';
import { formatDistance, formatHeadsign, formatTime, maneuverText } from '../../lib/i18n.ts';
import { buildManeuvers, nextManeuverIndex } from '../../lib/maneuvers.ts';
import type { Maneuver, ManeuverType } from '../../lib/maneuvers.ts';
import type { TripOption } from '../../lib/planner.ts';
import { streetRoute } from '../../lib/transitous.ts';
import type { RouteLeg, TransitLine } from '../../lib/transitous.ts';
import type { ParkedVehicle, Settings, TripRequest } from '../../lib/types.ts';
import { Button, LinkButton } from '../../ui/Button.tsx';
import { googleMapsUrl, richText, spotDisplayName, useI18n, wazeUrl } from '../../ui.ts';
import type { I18n } from '../../ui.ts';
import type { MapPoint, MapRoute } from '../map/MapCanvas.tsx';
import { modeGroup, modeIcon } from '../modes.ts';
import styles from './Navigation.module.css';

const MapCanvas = lazy(() => import('../map/MapCanvas.tsx'));

const VEHICLE_LEG_MODES = new Set(['CAR', 'BIKE']);
/** Distance from the route that counts as "off route". */
const OFF_ROUTE_METERS = 60;
/** Consecutive off-route GPS fixes before recalculating (filters GPS jitter). */
const OFF_ROUTE_FIXES = 3;
const ANNOUNCE_METERS = { car: 250, bicycle: 60, scooter: 60 } as const;
const CLOSE_TO_TURN_METERS = 100;
const HURRY_MINUTES = 2;
const NAV_PADDING = { top: 220, bottom: 260, left: 40, right: 40 };

const MANEUVER_ICONS: Record<Exclude<ManeuverType, 'arrive'>, LucideIcon> = {
  depart: ArrowUp,
  continue: ArrowUp,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  left: CornerUpLeft,
  right: CornerUpRight,
  sharp_left: ArrowDownLeft,
  sharp_right: ArrowDownRight,
  uturn: Undo2,
};

interface Props {
  option: TripOption;
  request: TripRequest;
  settings: Settings;
  theme: Theme;
  onParked: (parked: ParkedVehicle) => void;
  onExit: () => void;
}

function splitLegs(legs: RouteLeg[]): { vehicle: RouteLeg[]; rest: RouteLeg[] } {
  const firstOther = legs.findIndex((leg) => !VEHICLE_LEG_MODES.has(leg.mode));
  const split = firstOther === -1 ? legs.length : firstOther;
  return { vehicle: legs.slice(0, split), rest: legs.slice(split) };
}

function speak(text: string, language: Settings['language']): void {
  if (!('speechSynthesis' in window)) {
    return; // Voice is optional; the banner always shows the instruction.
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'he' ? 'he-IL' : 'en-US';
  window.speechSynthesis.speak(utterance);
}

function ManeuverIcon({ type }: { type: ManeuverType }) {
  if (type === 'arrive') {
    return (
      <span className={styles.parkingIcon} aria-hidden="true">
        P
      </span>
    );
  }
  const Icon = MANEUVER_ICONS[type];
  return <Icon className={styles.maneuverIcon} size={52} strokeWidth={2.5} aria-hidden="true" />;
}

function boardText(line: TransitLine, mode: string, i18n: I18n): ReactNode {
  const lineLabel = line.shortName === null ? mode : line.shortName;
  return line.headsign === null ? richText(i18n, 'boardLine', { line: lineLabel }) : richText(i18n, 'board', { line: lineLabel, headsign: formatHeadsign(line.headsign) });
}

/** Live "leaves in N min" label for a transit leg. */
function Countdown({ leg, now }: { leg: RouteLeg; now: Date }) {
  const { t } = useI18n();
  const minutes = Math.ceil((leg.startTime.getTime() - now.getTime()) / 60_000);
  if (minutes < 0) {
    return <span className={styles.countdown}>{t('departed')}</span>;
  }
  const hurry = minutes <= HURRY_MINUTES;
  return (
    <span className={styles.countdown} data-hurry={hurry}>
      {hurry ? t('hurry', { n: minutes }) : t('leavesIn', { n: minutes })}
    </span>
  );
}

function TransitSteps({ legs, startName, destinationName, vehicle }: { legs: RouteLeg[]; startName: string; destinationName: string; vehicle: TripRequest['vehicle'] }) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const now = useNow(15_000);
  const nextTransit = legs.find((leg) => leg.isTransit && leg.startTime.getTime() > now.getTime() - 60_000);
  const placeName = (name: string, atStart: boolean): string => {
    if (name === 'END') return destinationName;
    if (name === 'START' || name === '') return atStart ? startName : destinationName;
    return name;
  };
  return (
    <ol className={styles.steps}>
      {legs.map((leg, index) => {
        const Icon = modeIcon(modeGroup(leg.mode), vehicle);
        return (
          <li key={`${index}-${leg.mode}`} className={styles.step}>
            <span className={styles.stepTime}>{formatTime(language, leg.startTime)}</span>
            <Icon className={styles.stepIcon} size={20} aria-hidden="true" />
            <span className={styles.stepText}>
              {leg.line === null ? (
                <span>
                  {richText(i18n, leg.mode === 'BIKE' ? 'rideTo' : 'walkTo', { place: placeName(leg.toName, false) })} · {t('minutes', { n: Math.max(1, Math.round(leg.durationSeconds / 60)) })}
                </span>
              ) : (
                <>
                  <span>
                    {boardText(leg.line, leg.mode, i18n)} — <bdi>{placeName(leg.fromName, true)}</bdi>
                  </span>
                  <small>
                    {richText(i18n, 'alightAt', { stop: placeName(leg.toName, false) })} · {formatTime(language, leg.endTime)}
                  </small>
                  {leg === nextTransit && <Countdown leg={leg} now={now} />}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function NavigationScreen({ option, request, settings, theme, onParked, onExit }: Props) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const reducedMotion = useReducedMotion();
  const initial = useMemo(() => splitLegs(option.legs), [option]);
  const [vehicleLegs, setVehicleLegs] = useState<RouteLeg[]>(initial.vehicle);
  const [phase, setPhase] = useState<'vehicle' | 'transit'>(initial.vehicle.length > 0 ? 'vehicle' : 'transit');
  const [rerouting, setRerouting] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { position, error: gpsError } = useWatchedPosition();
  const offRouteFixes = useRef(0);
  const spoken = useRef(new Set<string>());
  const banner = useRef<HTMLDivElement>(null);

  const spot = option.spot;
  const carriesVehicle = option.kind === 'carry_on';
  const lastVehicleLeg = initial.vehicle[initial.vehicle.length - 1];
  const boardingStop = carriesVehicle && lastVehicleLeg !== undefined ? lastVehicleLeg : null;
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
  const next: Maneuver | undefined = nextIndex === -1 ? undefined : route.maneuvers[nextIndex];
  const following: Maneuver | undefined = nextIndex === -1 ? undefined : route.maneuvers[nextIndex + 1];
  const distanceToNext = next === undefined ? 0 : Math.max(0, next.distanceFromStartMeters - progress);
  const vehicleSeconds = vehicleLegs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  const remainingSeconds = totalMeters === 0 ? 0 : vehicleSeconds * Math.max(0, 1 - progress / totalMeters);
  const etaAtTarget = new Date(Date.now() + remainingSeconds * 1000);

  // Focus the banner when navigation starts, so screen readers begin with the instruction.
  useEffect(() => {
    if (banner.current !== null) {
      banner.current.focus();
    }
  }, [phase]);

  // Recalculate the vehicle route after several consecutive off-route GPS fixes.
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

  // Voice guidance: the first instruction at start, then each maneuver once when it gets close.
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

  const finishVehicle = () => {
    if (!carriesVehicle) {
      onParked({ location: position === null ? vehicleTarget : position, label: targetName, savedAt: new Date().toISOString() });
      if ('vibrate' in navigator) {
        navigator.vibrate(15);
      }
    }
    if (initial.rest.length === 0) {
      onExit();
    } else {
      setPhase('transit');
      setMenuOpen(false);
    }
  };

  const mapRoutes = useMemo<MapRoute[]>(
    () =>
      phase === 'vehicle'
        ? [
            { id: 'vehicle', legs: vehicleLegs, emphasis: 'selected' },
            { id: 'rest', legs: initial.rest, emphasis: 'faint' },
          ]
        : [{ id: 'rest', legs: initial.rest, emphasis: 'selected' }],
    [phase, vehicleLegs, initial.rest],
  );
  const mapPoints = useMemo<MapPoint[]>(() => {
    const points: MapPoint[] = [{ id: 'destination', position: request.destination.location, kind: 'destination', emphasis: 'selected', label: request.destination.name }];
    if (spot !== null) {
      points.push({ id: 'parking', position: spot.location, kind: 'parking', emphasis: 'selected', label: targetName });
    }
    if (position !== null) {
      points.push({ id: 'user', position, kind: 'user', emphasis: 'selected', label: t('myLocation') });
    }
    return points;
  }, [request.destination, spot, targetName, position, t]);

  const close = next !== undefined && distanceToNext <= CLOSE_TO_TURN_METERS && position !== null;
  const nextTransitLeg = initial.rest.find((leg) => leg.isTransit);

  return (
    <div className={styles.screen}>
      <Suspense fallback={null}>
        <MapCanvas
          theme={theme}
          language={language}
          label={t('mapLabel')}
          routes={mapRoutes}
          points={mapPoints}
          follow={position}
          fitKey={`nav-${phase}`}
          padding={NAV_PADDING}
          reducedMotion={reducedMotion}
        />
      </Suspense>

      <div className={styles.top}>
        <h1 className="visually-hidden">{t('navigate')}</h1>
        {phase === 'vehicle' && next !== undefined && (
          <div ref={banner} tabIndex={-1} className={styles.banner} data-close={close} role="status" aria-live="polite">
            <ManeuverIcon type={next.type} />
            <div key={`${next.distanceFromStartMeters}-${next.type}`} className={styles.bannerText}>
              <div className={styles.distance}>{position === null ? t('gpsWaiting') : formatDistance(language, distanceToNext)}</div>
              <div className={styles.instruction}>{maneuverText(t, next.type, next.streetName)}</div>
            </div>
          </div>
        )}
        {phase === 'transit' && (
          <div ref={banner} tabIndex={-1} className={styles.banner} role="status" aria-live="polite">
            <Flag size={40} aria-hidden="true" />
            <div className={styles.bannerText}>
              <div className={styles.instruction}>{nextTransitLeg !== undefined && nextTransitLeg.line !== null ? boardText(nextTransitLeg.line, nextTransitLeg.mode, i18n) : t('stepTransit')}</div>
            </div>
          </div>
        )}
        {phase === 'vehicle' && following !== undefined && following.type !== 'arrive' && (
          <span className={styles.then}>
            {t('then')} <ManeuverSmall type={following.type} /> {maneuverText(t, following.type, following.streetName)}
          </span>
        )}
        {rerouting && <p className={styles.notice}>{t('offRoute')}</p>}
        {gpsError !== null && <p className={styles.notice}>{t('gpsDenied')}</p>}
        {navError !== null && <p className={styles.notice} role="alert">{navError}</p>}
      </div>

      <div className={styles.bottom}>
        {phase === 'vehicle' ? (
          <>
            <div className={styles.eta}>
              <span className={styles.etaTime}>{formatTime(language, etaAtTarget)}</span>
              <span className={styles.etaRest}>
                {t('remaining', { minutes: t('minutes', { n: Math.max(1, Math.round(remainingSeconds / 60)) }), distance: formatDistance(language, Math.max(0, totalMeters - progress)) })}
              </span>
            </div>
            <p className={styles.etaRest}>
              {request.vehicle === 'car' ? t('stepDrive') : t('stepRide')} → <bdi>{targetName}</bdi>
            </p>
            <div className={styles.actions}>
              <Button variant="primary" size="large" icon={<Check size={20} aria-hidden="true" />} onClick={finishVehicle}>
                {initial.rest.length === 0 ? t('arrivedDone') : carriesVehicle ? t('continue') : t('iParked')}
              </Button>
              <Button variant="secondary" size="large" iconOnly icon={<Ellipsis size={22} aria-hidden="true" />} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                {t('moreActions')}
              </Button>
            </div>
            {menuOpen && (
              <div className={styles.menu}>
                <LinkButton variant="secondary" href={wazeUrl(vehicleTarget.lat, vehicleTarget.lng)} icon={<ExternalLink size={18} aria-hidden="true" />}>
                  {t('openInWaze')}
                </LinkButton>
                <LinkButton
                  variant="secondary"
                  href={googleMapsUrl(vehicleTarget.lat, vehicleTarget.lng, request.vehicle === 'car' ? 'driving' : 'bicycling')}
                  icon={<ExternalLink size={18} aria-hidden="true" />}
                >
                  {t('openInGoogleMaps')}
                </LinkButton>
                <Button variant="ghost" onClick={onExit}>
                  {t('endNavigation')}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <TransitSteps legs={initial.rest} startName={targetName} destinationName={request.destination.name} vehicle={request.vehicle} />
            <div className={styles.actions}>
              <Button variant="primary" size="large" icon={<Check size={20} aria-hidden="true" />} onClick={onExit}>
                {t('arrivedDone')}
              </Button>
              <LinkButton
                variant="secondary"
                size="large"
                iconOnly
                href={googleMapsUrl(request.destination.location.lat, request.destination.location.lng, 'transit')}
                icon={<ExternalLink size={20} aria-hidden="true" />}
              >
                {t('openInGoogleMaps')}
              </LinkButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ManeuverSmall({ type }: { type: ManeuverType }) {
  if (type === 'arrive') {
    return null;
  }
  const Icon = MANEUVER_ICONS[type];
  return <Icon size={16} aria-hidden="true" />;
}
