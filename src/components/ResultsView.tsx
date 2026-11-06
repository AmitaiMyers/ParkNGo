import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../lib/i18n.ts';
import type { MessageKey } from '../lib/i18n.ts';
import { planReturnTrip } from '../lib/planner.ts';
import type { PlanResult, TripOption } from '../lib/planner.ts';
import { transitousApi } from '../lib/transitous.ts';
import type { Itinerary } from '../lib/transitous.ts';
import type { Settings, TripRequest } from '../lib/types.ts';
import { REPORT_SPOT_URL, priceLabel, spotDisplayName, useI18n } from '../ui.ts';
import { MapView } from './MapView.tsx';
import type { MapMarker } from './MapView.tsx';

interface Props {
  result: PlanResult;
  request: TripRequest;
  settings: Settings;
  onNavigate: (option: TripOption) => void;
}

type HighlightKey = 'fastest' | 'cheapest' | 'balanced';
const HIGHLIGHT_ORDER: HighlightKey[] = ['balanced', 'fastest', 'cheapest'];

interface Card {
  option: TripOption;
  badges: HighlightKey[];
}

/** One card per distinct option, carrying every highlight it won. */
function highlightCards(result: PlanResult): Card[] {
  if (result.highlights === null) {
    return [];
  }
  const highlights = result.highlights;
  const cards: Card[] = [];
  for (const key of HIGHLIGHT_ORDER) {
    const option = highlights[key];
    const existing = cards.find((card) => card.option.id === option.id);
    if (existing === undefined) {
      cards.push({ option, badges: [key] });
    } else {
      existing.badges.push(key);
    }
  }
  return cards;
}

function ReturnTrip({ option, request, settings }: { option: TripOption; request: TripRequest; settings: Settings }) {
  const { language, t } = useI18n();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'done'; itinerary: Itinerary | null } | { status: 'error'; message: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    planReturnTrip(option, request, settings, transitousApi).then(
      (itinerary) => !cancelled && setState({ status: 'done', itinerary }),
      (reason: Error) => !cancelled && setState({ status: 'error', message: reason.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [option, request, settings]);

  switch (state.status) {
    case 'loading':
      return <p className="muted">{t('returnTrip')}: {t('planning')}</p>;
    case 'error':
      return <p className="error-text">{state.message}</p>;
    case 'done':
      return state.itinerary === null ? (
        <p className="warning">{t('noReturnTrip')}</p>
      ) : (
        <p className="muted">
          {t('returnTrip')}: {formatTime(language, state.itinerary.startTime)} → {formatTime(language, state.itinerary.endTime)} ·{' '}
          {t('transfers', { n: state.itinerary.transfers })}
        </p>
      );
  }
}

function OptionSummary({ option }: { option: TripOption }) {
  const { language, t } = useI18n();
  return (
    <p className="summary">
      <strong>{t('minutes', { n: Math.round(option.totalMinutes) })}</strong> · {t('arriveAt', { time: formatTime(language, option.arrival) })}
      {option.legs.some((leg) => leg.isTransit) && <> · {t('transfers', { n: option.transfers })}</>}
      {option.walkMinutes >= 1 && <> · {t('walk', { n: Math.round(option.walkMinutes) })}</>}
      {option.fuelCostIls > 0 && <> · {t('fuel', { amount: option.fuelCostIls.toFixed(1) })}</>}
    </p>
  );
}

export function ResultsView({ result, request, settings, onNavigate }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const cards = useMemo(() => highlightCards(result), [result]);
  const [selectedId, setSelectedId] = useState<string | null>(cards.length === 0 ? null : cards[0]!.option.id);
  const selected = cards.find((card) => card.option.id === selectedId);

  const mapLegs = useMemo(() => (selected === undefined ? [] : selected.option.legs), [selected]);
  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [
      { position: request.origin.location, label: request.origin.name, kind: 'origin' },
      { position: request.destination.location, label: request.destination.name, kind: 'destination' },
    ];
    if (selected !== undefined && selected.option.spot !== null) {
      list.push({ position: selected.option.spot.location, label: spotDisplayName(selected.option.spot, i18n), kind: 'parking' });
    }
    return list;
  }, [request, selected, i18n]);

  const vehicleOnlyKey: MessageKey = `vehicleOnly_${request.vehicle}`;

  return (
    <section className="results">
      <h2>{t('results')}</h2>
      <MapView className="map map-preview" legs={mapLegs} markers={markers} follow={null} />
      <p className="muted">{t('candidates', { n: result.candidatesConsidered })}</p>

      {cards.length === 0 && <p className="warning">{t('noOptions')}</p>}

      {cards.map(({ option, badges }) => {
        const spot = option.spot;
        if (spot === null) {
          throw new Error('A park-and-ride option must have a parking spot');
        }
        const isSelected = option.id === selectedId;
        return (
          <article key={option.id} className={`card option ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedId(option.id)}>
            <div className="badges">
              {badges.map((badge) => (
                <span key={badge} className={`badge badge-${badge}`}>
                  {t(badge)}
                </span>
              ))}
              {spot.isParkAndRide && <span className="badge">{t('parkAndRideLot')}</span>}
            </div>
            <h3>
              {t('parkAt')} {spotDisplayName(spot, i18n)} <span className="price">{priceLabel(spot, i18n)}</span>
            </h3>
            <p className="muted">
              🚉 {t('walkToStation', { meters: spot.nearestStation.distanceMeters, station: spot.nearestStation.name })}
              {spot.priceNote !== null && <> · {spot.priceNote}</>}
            </p>
            {spot.openingHours !== null && <p className="muted">{t('openingHours', { hours: spot.openingHours })}</p>}
            <OptionSummary option={option} />
            {isSelected && request.returnDeparture !== null && <ReturnTrip option={option} request={request} settings={settings} />}
            <button type="button" className="primary" onClick={() => onNavigate(option)}>
              {t('navigate')}
            </button>
          </article>
        );
      })}

      <h3>{t('compareWith')}</h3>
      {result.vehicleOnly !== null && (
        <div className="card baseline">
          <h4>{t(vehicleOnlyKey)}</h4>
          <OptionSummary option={result.vehicleOnly} />
          <p className="muted">{t('destinationParkingNotIncluded')}</p>
        </div>
      )}
      {result.transitOnly !== null && (
        <div className="card baseline">
          <h4>{t('transitOnly')}</h4>
          <OptionSummary option={result.transitOnly} />
        </div>
      )}

      <p>
        <a href={REPORT_SPOT_URL} target="_blank" rel="noreferrer">
          ➕ {t('reportSpot')}
        </a>
      </p>
    </section>
  );
}
