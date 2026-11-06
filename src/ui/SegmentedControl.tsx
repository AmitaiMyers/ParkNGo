import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface Props<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Native radio group (arrow keys work for free) with a sliding selection pill. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const name = useId();
  const index = options.findIndex((option) => option.value === value);
  if (index === -1) {
    throw new Error(`SegmentedControl value "${value}" is not one of its options`);
  }
  const style = { '--count': options.length, '--index': index } as CSSProperties;
  return (
    <div className={styles.group} role="radiogroup" aria-label={label} style={style}>
      <span className={styles.indicator} aria-hidden="true" />
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <span key={option.value} style={{ display: 'contents' }}>
            <input className={styles.input} type="radio" id={id} name={name} checked={option.value === value} onChange={() => onChange(option.value)} />
            <label className={styles.option} htmlFor={id}>
              {option.icon}
              {option.label}
            </label>
          </span>
        );
      })}
    </div>
  );
}
