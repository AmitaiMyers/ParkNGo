import type { Translate } from '../../lib/i18n.ts';
import type { MessageKey } from '../../lib/i18n.ts';
import type { RouteLeg } from '../../lib/transitous.ts';
import type { VehicleType } from '../../lib/types.ts';
import { modeGroup, modeIcon } from '../modes.ts';
import type { ModeGroup } from '../modes.ts';
import styles from './LegStrip.module.css';

/** Legs shorter than this are folded away (e.g. a zero-minute transfer walk). */
const MIN_LEG_SECONDS = 30;

function legLabel(group: ModeGroup, vehicle: VehicleType, minutes: number, t: Translate): string {
  const key: MessageKey = group === 'vehicle' ? `mode_vehicle_${vehicle}` : `mode_${group}`;
  return t(key, { n: minutes });
}

/** Proportional route summary: segment width ∝ time, each with an icon and minutes (never color alone). */
export function LegStrip({ legs, vehicle, t }: { legs: RouteLeg[]; vehicle: VehicleType; t: Translate }) {
  const shown = legs.filter((leg) => leg.durationSeconds >= MIN_LEG_SECONDS);
  const parts = shown.map((leg) => ({ group: modeGroup(leg.mode), minutes: Math.max(1, Math.round(leg.durationSeconds / 60)) }));
  const summary = parts.map((part) => legLabel(part.group, vehicle, part.minutes, t)).join(', ');
  return (
    <div className={styles.strip} role="img" aria-label={t('legsLabel', { legs: summary })}>
      {parts.map((part, index) => {
        const Icon = modeIcon(part.group, vehicle);
        return (
          <span key={index} className={`${styles.leg} ${styles[part.group]}`} style={{ flex: Math.max(part.minutes, 4) }}>
            <Icon size={14} aria-hidden="true" />
            <span className="num">{part.minutes}</span>
          </span>
        );
      })}
    </div>
  );
}
