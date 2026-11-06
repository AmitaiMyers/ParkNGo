import { useEffect, useState } from 'react';
import type { Dispatch } from 'react';
import { formatTime } from '../../lib/i18n.ts';
import type { MessageKey } from '../../lib/i18n.ts';
import { PLAN_STAGES, planReturnTrip } from '../../lib/planner.ts';
import type { PlanProgress, PlanResult, TripOption } from '../../lib/planner.ts';
import { transitousApi } from '../../lib/transitous.ts';
import type { Itinerary } from '../../lib/transitous.ts';
import type { AvoidZone, Settings, TripRequest } from '../../lib/types.ts';
import { visibleOutcome } from '../../state/planFlow.ts';
import type { FlowAction, FlowState, PlanOutcome } from '../../state/planFlow.ts';
import type { BadgeTone } from '../../ui/Badge.tsx';
import { Button } from '../../ui/Button.tsx';
import { ProgressSteps, Skeleton } from '../../ui/Feedback.tsx';
import type { StepState } from '../../ui/Feedback.tsx';
import { REPORT_SPOT_URL, useI18n } from '../../ui.ts';
import { explainOption } from './explain.ts';
import { OptionCard } from './OptionCard.tsx';
import styles from './Results.module.css';

type HighlightKey = 'balanced' | 'fastest' | 'cheapest';
const HIGHLIGHTS: { key: HighlightKey; tone: BadgeTone; label: MessageKey }[] = [
  { key: 'balanced', tone: 'recommended', label: 'balanced' },
  { key: 'fastest', tone: 'fastest', label: 'fastest' },
  { key: 'cheapest', tone: 'cheapest', label: 'cheapest' },
];
const WALK_FIX_METERS = 1200;

interface Props {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  settings: Settings;
  zones: AvoidZone[];
  onSettingsChange: (settings: Settings) => void;
  onStart: (option: TripOption, request: TripRequest) => void;
}

function stageSteps(progress: PlanProgress | null, t: ReturnType<typeof useI18n>['t']): { label: string; state: StepState }[] {
  const current = progress === null ? 0 : PLAN_STAGES.indexOf(progress.stage);
  return PLAN_STAGES.map((stage, index) => ({
    label:
      stage === 'routing'
        ? progress !== null && progress.lotCount !== null
          ? t('stage_routing', { n: progress.lotCount })
          : t('stage_routingUnknown')
        : t(`stage_${stage}`),
    state: index < current ? 'done' : index === current ? 'active' : 'idle',
  }));
}

function ReturnTripLine({ option, request, settings }: { option: TripOption; request: TripRequest; settings: Settings }) {
  const { language, t } = useI18n();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'done'; itinerary: Itinerary | null } | { kind: 'error'; message: string }>({ kind: 'loading' });
  useEffect(() => {
    let cancelled = false;
    planReturnTrip(option, request, settings, transitousApi).then(
      (itinerary) => !cancelled && setState({ kind: 'done', itinerary }),
      (reason: Error) => !cancelled && setState({ kind: 'error', message: reason.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [option, request, settings]);
  switch (state.kind) {
    case 'loading':
      return <p className={styles.muted}>{t('returnTrip')}: {t('planning')}</p>;
    case 'error':
      return <p className={styles.warning}>{state.message}</p>;
    case 'done':
      return state.itinerary === null ? (
        <p className={styles.warning}>{t('noReturnTrip')}</p>
      ) : (
        <p className={styles.muted}>
          {t('returnTrip')}: <span className="num">{formatTime(language, state.itinerary.startTime)} → {formatTime(language, state.itinerary.endTime)}</span> · {t('transfers', { n: state.itinerary.transfers })}
        </p>
      );
  }
}

function highlightCards(result: PlanResult): { option: TripOption; badges: HighlightKey[] }[] {
  if (result.highlights === null) {
    return [];
  }
  const highlights = result.highlights;
  const cards: { option: TripOption; badges: HighlightKey[] }[] = [];
  for (const { key } of HIGHLIGHTS) {
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

function EmptyState({ settings, zones, onSettingsChange }: Pick<Props, 'settings' | 'zones' | 'onSettingsChange'>) {
  const { language, t } = useI18n();
  const avoided = zones.filter((zone) => settings.avoidZoneIds.includes(zone.id));
  return (
    <div className={styles.empty}>
      <h3>{t('emptyTitle')}</h3>
      <p className={styles.muted}>{t('emptyHint')}</p>
      <div className={styles.fixes}>
        {settings.pricePolicy === 'free_only' && (
          <Button variant="secondary" size="small" onClick={() => onSettingsChange({ ...settings, pricePolicy: 'allow_paid' })}>
            {t('fixAllowPaid')}
          </Button>
        )}
        {settings.maxWalkMeters < WALK_FIX_METERS && (
          <Button variant="secondary" size="small" onClick={() => onSettingsChange({ ...settings, maxWalkMeters: WALK_FIX_METERS })}>
            {t('fixWalkMore', { m: WALK_FIX_METERS })}
          </Button>
        )}
        {avoided.map((zone) => (
          <Button key={zone.id} variant="secondary" size="small" onClick={() => onSettingsChange({ ...settings, avoidZoneIds: settings.avoidZoneIds.filter((id) => id !== zone.id) })}>
            {t('fixAvoidZone', { zone: zone.name[language] })}
          </Button>
        ))}
      </div>
    </div>
  );
}

function OutcomeView({ outcome, state, dispatch, settings, zones, onSettingsChange, onStart }: Props & { outcome: PlanOutcome }) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const { request, result } = outcome;
  const select = (option: TripOption) => dispatch({ type: 'select', optionId: option.id });

  if (outcome.mode === 'return_to_vehicle') {
    const option = result.transitOnly;
    return (
      <>
        <h2 className={styles.title}>{t('returnTitle')}</h2>
        {option === null ? (
          <p className={styles.warning}>{t('noReturnNow')}</p>
        ) : (
          <OptionCard
            option={option}
            title={request.destination.name}
            badges={[]}
            vehicle={request.vehicle}
            selected
            why={null}
            live={null}
            extra={null}
            index={0}
            onSelect={() => select(option)}
            onStart={() => onStart(option, request)}
          />
        )}
      </>
    );
  }

  const cards = highlightCards(result);
  const vehicleOnlyKey: MessageKey = `vehicleOnly_${request.vehicle}`;
  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('yourOptions')}</h2>
        <span className={styles.muted}>{t('candidates', { n: result.candidatesConsidered })}</span>
      </div>
      {result.skippedFullOrClosed > 0 && <p className={styles.muted}>{t('skippedFull', { n: result.skippedFullOrClosed })}</p>}
      {result.liveStatusError !== null && <p className={styles.warning}>{t('liveStatusUnavailable', { error: result.liveStatusError })}</p>}
      {cards.length === 0 && <EmptyState settings={settings} zones={zones} onSettingsChange={onSettingsChange} />}
      {cards.map(({ option, badges }, index) => {
        const live = option.spot === null ? undefined : result.liveStatuses.get(option.spot.id);
        const selected = option.id === state.selectedOptionId;
        return (
          <OptionCard
            key={option.id}
            option={option}
            title={null}
            badges={badges.map((key) => {
              const highlight = HIGHLIGHTS.find((h) => h.key === key)!;
              return { tone: highlight.tone, label: t(highlight.label) };
            })}
            vehicle={request.vehicle}
            selected={selected}
            why={explainOption(option, result, t)}
            live={live === undefined ? null : live}
            extra={selected && request.returnDeparture !== null ? <ReturnTripLine option={option} request={request} settings={settings} /> : null}
            index={index}
            onSelect={() => select(option)}
            onStart={() => onStart(option, request)}
          />
        );
      })}
      {result.carryOn !== null && (
        <OptionCard
          option={result.carryOn}
          title={t('carryOn')}
          badges={[]}
          vehicle={request.vehicle}
          selected={result.carryOn.id === state.selectedOptionId}
          why={[t('carryOnNote')]}
          live={null}
          extra={null}
          index={cards.length}
          onSelect={() => select(result.carryOn!)}
          onStart={() => onStart(result.carryOn!, request)}
        />
      )}
      <h3 className={styles.sectionTitle}>{t('compareWith')}</h3>
      {result.vehicleOnly !== null && (
        <div className={styles.compare}>
          <span>
            {t(vehicleOnlyKey)}
            <br />
            <span className={styles.muted}>{t('destinationParkingNotIncluded')}</span>
          </span>
          <strong>{Math.round(result.vehicleOnly.totalMinutes)} {t('min')}</strong>
        </div>
      )}
      {result.transitOnly !== null && (
        <div className={styles.compare}>
          <span>
            {t('transitOnly')}
            <br />
            <span className={`${styles.muted} num`}>{t('arriveBy', { time: formatTime(language, result.transitOnly.arrival) })}</span>
          </span>
          <strong>{Math.round(result.transitOnly.totalMinutes)} {t('min')}</strong>
        </div>
      )}
      <a className={styles.link} href={REPORT_SPOT_URL} target="_blank" rel="noreferrer">
        {t('reportSpot')}
      </a>
    </>
  );
}

export function ResultsPanel(props: Props) {
  const { t } = useI18n();
  const { status } = props.state;
  const outcome = visibleOutcome(status);
  const busy = status.kind === 'planning';

  return (
    <div className={styles.panel} aria-busy={busy}>
      <p className="visually-hidden" aria-live="polite">
        {status.kind === 'planning' ? stageSteps(status.progress, t).find((step) => step.state === 'active')!.label : ''}
      </p>
      {status.kind === 'planning' && outcome === null && (
        <>
          <ProgressSteps steps={stageSteps(status.progress, t)} />
          <Skeleton height={140} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </>
      )}
      {status.kind === 'planning' && outcome !== null && <div className={styles.progressBar} role="progressbar" aria-label={t('updating')} />}
      {status.kind === 'error' && (
        <div className={styles.error} role="alert">
          <span>{t('planFailed', { error: status.message })}</span>
          <Button variant="secondary" size="small" onClick={() => props.dispatch({ type: 'retry' })}>
            {t('retry')}
          </Button>
        </div>
      )}
      {outcome !== null && (
        <div className={busy ? `${styles.panel} ${styles.dimmed}` : styles.panel}>
          <OutcomeView {...props} outcome={outcome} />
        </div>
      )}
    </div>
  );
}
