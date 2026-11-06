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
import { splitIntoSegments } from '../../lib/segments.ts';
import type { NavigationSegment } from '../../lib/segments.ts';
import type { LatLng, ParkedVehicle, Settings, TripRequest } from '../../lib/types.ts';
import { Button, LinkButton } from '../../ui/Button.tsx';
import { googleMapsUrl, richText, spotDisplayName, useI18n, wazeUrl } from '../../ui.ts';
import type { I18n } from '../../ui.ts';
import type { MapPoint, MapRoute } from '../map/MapCanvas.tsx';
import { modeGroup, modeIcon } from '../modes.ts';
import styles from './Navigation.module.css';

const MapCanvas = lazy(() => import('../map/MapCanvas.tsx'));

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

function speak(text: string, language: Settings['language']): void {
  if (!('speechSynthesis' in window)) {
    return; // Voice is optional; the banner always shows the instruction.
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'he' ? 'he-IL' : 'en-US';
  window.speechSynthesis.speak(utterance);
}

function ManeuverIcon({ type, endKind }: { type: ManeuverType; endKind: SegmentEnd['kind'] }) {
  if (type === 'arrive' && endKind !== 'parking') {
    return <Flag className={styles.maneuverIcon} size={48} strokeWidth={2.5} aria-hidden="true" />;
  }
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

/** Where a segment ends and how it is named in the UI. */
interface SegmentEnd {
  location: LatLng;
  name: string;
  kind: 'parking' | 'stop' | 'destination';
}

interface StreetSegmentProps {
  initialLegs: RouteLeg[];
  end: SegmentEnd;
  vehicle: TripRequest['vehicle'];
  settings: Settings;
  position: LatLng | null;
  gpsError: string | null;
  primaryLabel: string;
  onPrimary: (position: LatLng | null) => void;
  onRouteChange: (legs: RouteLeg[]) => void;
  onExit: () => void;
}

/** Turn-by-turn guidance for one drive or ride segment (the first one, or the final ride of a carried vehicle). */
function StreetSegment({ initialLegs, end, vehicle, settings, position, gpsError, primaryLabel, onPrimary, onRouteChange, onExit }: StreetSegmentProps) {
  const { language, t } = useI18n();
  const [legs, setLegs] = useState<RouteLeg[]>(initialLegs);
  const [rerouting, setRerouting] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const offRouteFixes = useRef(0);
  const spoken = useRef(new Set<string>());
  const banner = useRef<HTMLDivElement>(null);

  const route = useMemo(() => {
    const points = legs.flatMap((leg) => leg.geometry);
    const steps = legs.flatMap((leg) => leg.steps);
    return { points, cumulative: cumulativeDistances(points), maneuvers: steps.length === 0 ? [] : buildManeuvers(steps) };
  }, [legs]);

  const totalMeters = route.cumulative[route.cumulative.length - 1]!;
  const projection = position !== null && route.points.length >= 2 ? projectOntoRoute(position, route.points, route.cumulative) : null;
  const progress = projection === null ? 0 : projection.progressMeters;
  const nextIndex = route.maneuvers.length === 0 ? -1 : nextManeuverIndex(route.maneuvers, progress);
  const next: Maneuver | undefined = nextIndex === -1 ? undefined : route.maneuvers[nextIndex];
  const following: Maneuver | undefined = nextIndex === -1 ? undefined : route.maneuvers[nextIndex + 1];
  const distanceToNext = next === undefined ? 0 : Math.max(0, next.distanceFromStartMeters - progress);
  const segmentSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  const remainingSeconds = totalMeters === 0 ? 0 : segmentSeconds * Math.max(0, 1 - progress / totalMeters);
  const etaAtEnd = new Date(Date.now() + remainingSeconds * 1000);
  const close = next !== undefined && distanceToNext <= CLOSE_TO_TURN_METERS && position !== null;
  /** The arrival instruction names where this segment ends (parking, boarding stop or destination). */
  const instruction = (maneuver: Maneuver): string =>
    maneuver.type === 'arrive' && end.kind !== 'parking' ? t('arriveAtPlace', { place: end.name }) : maneuverText(t, maneuver.type, maneuver.streetName);

  // Screen readers start each segment at its instruction.
  useEffect(() => {
    if (banner.current !== null) {
      banner.current.focus();
    }
  }, []);

  // Recalculate after several consecutive off-route GPS fixes.
  useEffect(() => {
    if (position === null || rerouting || route.points.length < 2) {
      return;
    }
    const { offsetMeters } = projectOntoRoute(position, route.points, route.cumulative);
    offRouteFixes.current = offsetMeters > OFF_ROUTE_METERS ? offRouteFixes.current + 1 : 0;
    if (offRouteFixes.current < OFF_ROUTE_FIXES) {
      return;
    }
    offRouteFixes.current = 0;
    setRerouting(true);
    streetRoute(position, end.location, vehicle, new Date(), language).then(
      (itinerary) => {
        setRerouting(false);
        if (itinerary !== null) {
          spoken.current.clear();
          setLegs(itinerary.legs);
          onRouteChange(itinerary.legs);
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
    if (!settings.voiceGuidance || next === undefined) {
      return;
    }
    const first = route.maneuvers[0]!;
    const firstKey = `${first.distanceFromStartMeters}-${first.type}-start`;
    if (!spoken.current.has(firstKey)) {
      spoken.current.add(firstKey);
      speak(instruction(first), language);
      return;
    }
    const key = `${next.distanceFromStartMeters}-${next.type}`;
    if (position !== null && distanceToNext < ANNOUNCE_METERS[vehicle] && !spoken.current.has(key)) {
      spoken.current.add(key);
      speak(`${t('inMeters', { distance: formatDistance(language, distanceToNext) })}, ${instruction(next)}`, language);
    }
  }, [settings.voiceGuidance, next, distanceToNext, position, route, vehicle, t, language]);

  return (
    <>
      <div className={styles.top}>
        {next !== undefined && (
          <div ref={banner} tabIndex={-1} className={styles.banner} data-close={close} role="status" aria-live="polite">
            <ManeuverIcon type={next.type} endKind={end.kind} />
            <div key={`${next.distanceFromStartMeters}-${next.type}`} className={styles.bannerText}>
              <div className={styles.distance}>{position === null ? t('gpsWaiting') : formatDistance(language, distanceToNext)}</div>
              <div className={styles.instruction}>
                <bdi>{instruction(next)}</bdi>
              </div>
            </div>
          </div>
        )}
        {following !== undefined && following.type !== 'arrive' && (
          <span className={styles.then}>
            {t('then')} <ManeuverSmall type={following.type} /> {maneuverText(t, following.type, following.streetName)}
          </span>
        )}
        {rerouting && <p className={styles.notice}>{t('offRoute')}</p>}
        {gpsError !== null && <p className={styles.notice}>{t('gpsDenied')}</p>}
        {navError !== null && (
          <p className={styles.notice} role="alert">
            {navError}
          </p>
        )}
      </div>

      <div className={styles.bottom}>
        <div className={styles.eta}>
          <span className={styles.etaTime}>{formatTime(language, etaAtEnd)}</span>
          <span className={styles.etaRest}>
            {t('remaining', { minutes: t('minutes', { n: Math.max(1, Math.round(remainingSeconds / 60)) }), distance: formatDistance(language, Math.max(0, totalMeters - progress)) })}
          </span>
        </div>
        <p className={styles.etaRest}>
          {vehicle === 'car' ? t('stepDrive') : t('stepRide')} → <bdi>{end.name}</bdi>
        </p>
        <div className={styles.actions}>
          <Button variant="primary" size="large" icon={<Check size={20} aria-hidden="true" />} onClick={() => onPrimary(position)}>
            {primaryLabel}
          </Button>
          <Button variant="secondary" size="large" iconOnly icon={<Ellipsis size={22} aria-hidden="true" />} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {t('moreActions')}
          </Button>
        </div>
        {menuOpen && (
          <div className={styles.menu}>
            <LinkButton variant="secondary" href={wazeUrl(end.location.lat, end.location.lng)} icon={<ExternalLink size={18} aria-hidden="true" />}>
              {t('openInWaze')}
            </LinkButton>
            <LinkButton
              variant="secondary"
              href={googleMapsUrl(end.location.lat, end.location.lng, vehicle === 'car' ? 'driving' : 'bicycling')}
              icon={<ExternalLink size={18} aria-hidden="true" />}
            >
              {t('openInGoogleMaps')}
            </LinkButton>
            <Button variant="ghost" onClick={onExit}>
              {t('endNavigation')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

interface TransitSegmentProps {
  legs: RouteLeg[];
  startName: string;
  destination: TripRequest['destination'];
  vehicle: TripRequest['vehicle'];
  gpsError: string | null;
  primaryLabel: string;
  onPrimary: () => void;
}

/** Walks and public transport, as steps with a live countdown. */
function TransitSegment({ legs, startName, destination, vehicle, gpsError, primaryLabel, onPrimary }: TransitSegmentProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const banner = useRef<HTMLDivElement>(null);
  const nextTransitLeg = legs.find((leg) => leg.isTransit);

  useEffect(() => {
    if (banner.current !== null) {
      banner.current.focus();
    }
  }, []);

  return (
    <>
      <div className={styles.top}>
        <div ref={banner} tabIndex={-1} className={styles.banner} role="status" aria-live="polite">
          <Flag size={40} aria-hidden="true" />
          <div className={styles.bannerText}>
            <div className={styles.instruction}>{nextTransitLeg !== undefined && nextTransitLeg.line !== null ? boardText(nextTransitLeg.line, nextTransitLeg.mode, i18n) : t('stepTransit')}</div>
          </div>
        </div>
        {gpsError !== null && <p className={styles.notice}>{t('gpsDenied')}</p>}
      </div>
      <div className={styles.bottom}>
        <TransitSteps legs={legs} startName={startName} destinationName={destination.name} vehicle={vehicle} />
        <div className={styles.actions}>
          <Button variant="primary" size="large" icon={<Check size={20} aria-hidden="true" />} onClick={onPrimary}>
            {primaryLabel}
          </Button>
          <LinkButton variant="secondary" size="large" iconOnly href={googleMapsUrl(destination.location.lat, destination.location.lng, 'transit')} icon={<ExternalLink size={20} aria-hidden="true" />}>
            {t('openInGoogleMaps')}
          </LinkButton>
        </div>
      </div>
    </>
  );
}

export function NavigationScreen({ option, request, settings, theme, onParked, onExit }: Props) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const reducedMotion = useReducedMotion();
  const segments = useMemo<NavigationSegment[]>(() => splitIntoSegments(option.legs), [option]);
  const [index, setIndex] = useState(0);
  // The active street segment's legs change when it is re-routed; the map follows them.
  const [activeLegs, setActiveLegs] = useState<RouteLeg[]>(segments[0]!.legs);
  const { position, error: gpsError } = useWatchedPosition();

  const segment = segments[index]!;
  const isLast = index === segments.length - 1;
  const spot = option.spot;
  const carriesVehicle = option.kind === 'carry_on';
  const spotName = spot === null ? null : spotDisplayName(spot, i18n);

  /** End of a street segment: the parking spot (park & ride), the boarding stop (carried vehicle), or the destination. */
  const streetEnd = (segmentIndex: number): SegmentEnd => {
    const last = segments[segmentIndex]!.legs[segments[segmentIndex]!.legs.length - 1]!;
    if (segmentIndex === segments.length - 1) {
      return { location: request.destination.location, name: request.destination.name, kind: 'destination' };
    }
    return spot !== null && spotName !== null ? { location: spot.location, name: spotName, kind: 'parking' } : { location: last.to, name: last.toName, kind: 'stop' };
  };

  const goTo = (nextIndex: number) => {
    setIndex(nextIndex);
    setActiveLegs(segments[nextIndex]!.legs);
  };

  const finishStreet = (at: LatLng | null) => {
    const end = streetEnd(index);
    // A carried bicycle or scooter is never parked, so nothing is remembered for it.
    if (!carriesVehicle) {
      onParked({ location: at === null ? end.location : at, label: end.name, savedAt: new Date().toISOString() });
      if ('vibrate' in navigator) {
        navigator.vibrate(15);
      }
    }
    if (isLast) {
      onExit();
    } else {
      goTo(index + 1);
    }
  };

  const streetLabel = isLast ? t('arrivedDone') : carriesVehicle ? t('continue') : t('iParked');
  const transitLabel = isLast ? t('arrivedDone') : t('startRiding');
  const previousStreet = index > 0 ? streetEnd(index - 1) : null;

  const mapRoutes = useMemo<MapRoute[]>(
    () => segments.map((s, i) => ({ id: `segment-${i}`, legs: i === index ? activeLegs : s.legs, emphasis: i === index ? 'selected' : 'faint' })),
    [segments, index, activeLegs],
  );
  const mapPoints = useMemo<MapPoint[]>(() => {
    const points: MapPoint[] = [{ id: 'destination', position: request.destination.location, kind: 'destination', emphasis: 'selected', label: request.destination.name }];
    if (spot !== null && spotName !== null) {
      points.push({ id: 'parking', position: spot.location, kind: 'parking', emphasis: 'selected', label: spotName });
    }
    if (position !== null) {
      points.push({ id: 'user', position, kind: 'user', emphasis: 'selected', label: t('myLocation') });
    }
    return points;
  }, [request.destination, spot, spotName, position, t]);

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
          fitKey={`nav-${index}`}
          padding={NAV_PADDING}
          reducedMotion={reducedMotion}
        />
      </Suspense>
      <h1 className="visually-hidden">{t('navigate')}</h1>
      {segment.kind === 'street' ? (
        <StreetSegment
          key={index}
          initialLegs={segment.legs}
          end={streetEnd(index)}
          vehicle={request.vehicle}
          settings={settings}
          position={position}
          gpsError={gpsError}
          primaryLabel={streetLabel}
          onPrimary={finishStreet}
          onRouteChange={setActiveLegs}
          onExit={onExit}
        />
      ) : (
        <TransitSegment
          key={index}
          legs={segment.legs}
          startName={previousStreet === null ? request.origin.name : previousStreet.name}
          destination={request.destination}
          vehicle={request.vehicle}
          gpsError={gpsError}
          primaryLabel={transitLabel}
          onPrimary={() => (isLast ? onExit() : goTo(index + 1))}
        />
      )}
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
