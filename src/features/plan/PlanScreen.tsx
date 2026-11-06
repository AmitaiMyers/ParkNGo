import { Navigation2, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { useAfterIdle, useIsWide, useReducedMotion } from '../../hooks/useEnvironment.ts';
import type { Theme } from '../../hooks/useEnvironment.ts';
import { formatTime } from '../../lib/i18n.ts';
import type { TripOption } from '../../lib/planner.ts';
import type { SavedPlaces } from '../../lib/storage.ts';
import type { ParkedVehicle, ParkingDataset, Place, Settings, TripRequest } from '../../lib/types.ts';
import { visibleOutcome } from '../../state/planFlow.ts';
import type { FlowAction, FlowState, PlanOutcome } from '../../state/planFlow.ts';
import { Button } from '../../ui/Button.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import type { SnapPoint } from '../../ui/Sheet.tsx';
import { spotDisplayName, useI18n } from '../../ui.ts';
import type { I18n } from '../../ui.ts';
import type { MapPadding, MapPoint, MapRoute } from '../map/MapCanvas.tsx';
import { ResultsPanel } from '../results/ResultsPanel.tsx';
import { TripOptions } from '../results/TripOptions.tsx';
import { SearchCard } from '../search/SearchCard.tsx';
import styles from './Plan.module.css';

const MapCanvas = lazy(() => import('../map/MapCanvas.tsx'));

interface Props {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  settings: Settings;
  dataset: ParkingDataset;
  saved: SavedPlaces;
  recents: Place[];
  parked: ParkedVehicle | null;
  theme: Theme;
  online: boolean;
  onPlaceChosen: (place: Place) => void;
  onOpenSettings: () => void;
  onStart: (option: TripOption, request: TripRequest) => void;
  onClearParked: () => void;
}

/** Options shown on the map: the selected one in full color, the other highlighted ones faint. */
function mapOptions(outcome: PlanOutcome): TripOption[] {
  const { result } = outcome;
  const highlighted = result.highlights === null ? [] : [result.highlights.balanced, result.highlights.fastest, result.highlights.cheapest];
  const all = [...highlighted, ...(result.carryOn === null ? [] : [result.carryOn]), ...(outcome.mode === 'return_to_vehicle' && result.transitOnly !== null ? [result.transitOnly] : [])];
  return all.filter((option, index) => all.findIndex((other) => other.id === option.id) === index);
}

function buildMap(outcome: PlanOutcome | null, destination: Place | null, selectedId: string | null, i18n: I18n): { routes: MapRoute[]; points: MapPoint[] } {
  if (outcome === null) {
    return { routes: [], points: destination === null ? [] : [{ id: 'destination', position: destination.location, kind: 'destination', emphasis: 'selected', label: destination.name }] };
  }
  const options = mapOptions(outcome);
  const routes: MapRoute[] = options.map((option) => ({ id: option.id, legs: option.legs, emphasis: option.id === selectedId ? 'selected' : 'faint' }));
  const points: MapPoint[] = [
    { id: 'origin', position: outcome.request.origin.location, kind: 'origin', emphasis: 'selected', label: outcome.request.origin.name },
    { id: 'destination', position: outcome.request.destination.location, kind: 'destination', emphasis: 'selected', label: outcome.request.destination.name },
    ...options
      .filter((option) => option.spot !== null)
      .map((option) => ({
        id: option.spot!.id,
        position: option.spot!.location,
        kind: 'parking' as const,
        emphasis: option.id === selectedId ? ('selected' as const) : ('faint' as const),
        label: spotDisplayName(option.spot!, i18n),
      })),
  ];
  return { routes, points };
}

function ParkedCard({ parked, onReturn, onClear }: { parked: ParkedVehicle; onReturn: () => void; onClear: () => void }) {
  const { language, t } = useI18n();
  return (
    <div className={styles.parked}>
      <div className={styles.parkedTop}>
        <span className={styles.p} aria-hidden="true">
          P
        </span>
        <span>
          {t('parkedAtPrefix')}
          <strong>
            <bdi>{parked.label}</bdi>
          </strong>
          <br />
          {t('parkedSince', { time: formatTime(language, new Date(parked.savedAt)) })}
        </span>
      </div>
      <div className={styles.parkedActions}>
        <Button variant="primary" icon={<Navigation2 size={18} aria-hidden="true" />} onClick={onReturn}>
          {t('getMeBack')}
        </Button>
        <Button variant="ghost" icon={<X size={18} aria-hidden="true" />} onClick={onClear}>
          {t('forgetParking')}
        </Button>
      </div>
    </div>
  );
}

export function PlanScreen(props: Props) {
  const { state, dispatch, settings, dataset, saved, recents, parked, theme, online, onPlaceChosen, onOpenSettings, onStart, onClearParked } = props;
  const i18n = useI18n();
  const { language, t } = i18n;
  const isWide = useIsWide();
  const reducedMotion = useReducedMotion();
  const mapReady = useAfterIdle();
  const [snap, setSnap] = useState<SnapPoint>('peek');
  const outcome = visibleOutcome(state.status);
  const hasTrip = state.draft.destination !== null;

  // Open the sheet when a trip starts planning. Without a trip it collapses — unless a parked
  // vehicle is remembered, whose "Get me back" card must stay visible.
  const hasParked = parked !== null;
  useEffect(() => {
    setSnap(hasTrip || hasParked ? 'half' : 'peek');
  }, [hasTrip, hasParked]);

  const map = useMemo(() => buildMap(outcome, state.draft.destination, state.selectedOptionId, i18n), [outcome, state.draft.destination, state.selectedOptionId, i18n]);
  const fitKey = outcome !== null ? `${state.selectedOptionId}|${outcome.request.destination.name}|${outcome.request.vehicle}` : hasTrip ? `destination|${state.draft.destination!.name}` : 'none';
  const padding = useMemo<MapPadding>(() => {
    if (isWide) {
      const panel = 400 + 48;
      return language === 'he' ? { top: 48, bottom: 48, left: 48, right: panel } : { top: 48, bottom: 48, left: panel, right: 48 };
    }
    return { top: 150, bottom: Math.round(window.innerHeight * 0.55) + 16, left: 32, right: 32 };
  }, [isWide, language]);

  const search = (
    <SearchCard
      draft={state.draft}
      saved={saved}
      recents={recents}
      placement={isWide ? 'embedded' : 'floating'}
      online={online}
      dispatch={dispatch}
      onPlaceChosen={onPlaceChosen}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <div className={styles.screen}>
      <h1 className="visually-hidden">{t('appName')}</h1>
      {mapReady ? (
        <Suspense fallback={<div className={styles.mapFallback} />}>
          <MapCanvas theme={theme} language={language} label={t('mapLabel')} routes={map.routes} points={map.points} follow={null} fitKey={fitKey} padding={padding} reducedMotion={reducedMotion} />
        </Suspense>
      ) : (
        <div className={styles.mapFallback} />
      )}
      {!isWide && search}
      <Sheet label={t('sheetLabel')} handleLabel={t(`sheet_${snap}`)} snap={snap} onSnapChange={setSnap}>
        <div className={styles.content}>
          {isWide && search}
          {!hasTrip && (
            <div className={styles.idle}>
              <h2>{t('idleTitle')}</h2>
              <p>{t('idleHint')}</p>
            </div>
          )}
          {!hasTrip && parked !== null && (
            <ParkedCard parked={parked} onReturn={() => dispatch({ type: 'returnToVehicle', parked })} onClear={onClearParked} />
          )}
          {hasTrip && state.draft.mode === 'park_and_ride' && <TripOptions draft={state.draft} zones={dataset.avoidZones} dispatch={dispatch} />}
          {hasTrip && (
            <ResultsPanel state={state} dispatch={dispatch} settings={settings} onStart={onStart} />
          )}
        </div>
      </Sheet>
    </div>
  );
}
