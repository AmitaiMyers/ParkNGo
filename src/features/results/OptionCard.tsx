import { useId } from 'react';
import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { formatArrival } from '../../lib/i18n.ts';
import type { TripOption } from '../../lib/planner.ts';
import type { LiveLotStatus } from '../../lib/telAvivParking.ts';
import type { VehicleType } from '../../lib/types.ts';
import { Badge } from '../../ui/Badge.tsx';
import type { BadgeTone } from '../../ui/Badge.tsx';
import { Button } from '../../ui/Button.tsx';
import { LiveStatus } from '../../ui/Feedback.tsx';
import { formatUpdated, priceBadge, spotDisplayName, useI18n } from '../../ui.ts';
import { LegStrip } from './LegStrip.tsx';
import styles from './Results.module.css';

interface Props {
  option: TripOption;
  title: string | null;
  badges: { tone: BadgeTone; label: string }[];
  vehicle: VehicleType;
  selected: boolean;
  why: string[] | null;
  live: LiveLotStatus | null;
  /** Extra details (e.g. the return trip), shown when selected. */
  extra: ReactNode;
  index: number;
  onSelect: () => void;
  onStart: () => void;
}

export function OptionCard({ option, title, badges, vehicle, selected, why, live, extra, index, onSelect, onStart }: Props) {
  const i18n = useI18n();
  const { language, t } = i18n;
  const detailsId = useId();
  const spot = option.spot;
  const name = title !== null ? title : spot === null ? '' : spotDisplayName(spot, i18n);
  const price = spot === null ? null : priceBadge(spot, i18n);
  const hasTransit = option.legs.some((leg) => leg.isTransit);

  return (
    <article className={styles.card} data-selected={selected} style={{ animationDelay: `${index * 40}ms` }}>
      <button type="button" className={styles.summary} aria-expanded={selected} aria-controls={detailsId} onClick={onSelect}>
        {badges.length > 0 && (
          <span className={styles.badges}>
            {badges.map((badge) => (
              <Badge key={badge.label} tone={badge.tone}>
                {badge.label}
              </Badge>
            ))}
          </span>
        )}
        <span className={styles.top}>
          <span>
            <span className={styles.name}>
              {spot !== null && t('parkAt')}
              <bdi>{name}</bdi>
            </span>
            {price !== null && (
              <span className={styles.priceRow}>
                <Badge tone={price.tone}>{price.label}</Badge>
              </span>
            )}
          </span>
          <span className={styles.duration}>
            {Math.round(option.totalMinutes)} <small>{t('min')}</small>
          </span>
        </span>
        <span className={styles.meta}>
          <span className="num">{t('arriveAt', { time: formatArrival(language, option.arrival, option.departure) })}</span>
          {hasTransit && <span>{t('transfers', { n: option.transfers })}</span>}
          {option.walkMinutes >= 1 && <span>{t('walk', { n: Math.round(option.walkMinutes) })}</span>}
          {live !== null && <LiveStatus occupancy={live.occupancy} label={t(`live_${live.occupancy}`)} updated={formatUpdated(live, i18n)} />}
        </span>
      </button>
      {selected && (
        <div className={styles.details} id={detailsId}>
          <LegStrip legs={option.legs} vehicle={vehicle} t={t} />
          {why !== null && why.length > 0 && (
            <p className={styles.why}>
              {why.map((part, index) => (
                <span key={part}>
                  {index > 0 && ' · '}
                  <bdi>{part}</bdi>
                </span>
              ))}
            </p>
          )}
          {spot !== null && spot.priceNote !== null && (
            <p className={styles.note} title={spot.priceNote}>
              {spot.priceNote}
            </p>
          )}
          {spot !== null && spot.openingHours !== null && <p className={styles.note}>{t('openingHours', { hours: spot.openingHours })}</p>}
          {extra}
          <Button variant="primary" size="large" block icon={<Play size={18} aria-hidden="true" />} onClick={onStart}>
            {t('start')}
          </Button>
        </div>
      )}
    </article>
  );
}
