import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import styles from './Feedback.module.css';
import type { LotOccupancy } from '../lib/telAvivParking.ts';

export function Skeleton({ height }: { height: number }) {
  return <div className={styles.skeleton} style={{ height } as CSSProperties} aria-hidden="true" />;
}

export type StepState = 'idle' | 'active' | 'done';

export function ProgressSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step) => (
        <li key={step.label} className={styles.step} data-state={step.state}>
          <span className={styles.tick} aria-hidden="true">
            {step.state === 'done' && <Check size={12} strokeWidth={3} />}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function LiveStatus({ occupancy, label, updated }: { occupancy: LotOccupancy; label: string; updated: string | null }) {
  return (
    <span className={`${styles.live} ${styles[occupancy]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
      {updated !== null && <span className={styles.updated}>· {updated}</span>}
    </span>
  );
}
