import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Chip.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: ReactNode;
  /** Set for toggle chips; omit for action chips. */
  pressed?: boolean;
  children: ReactNode;
}

export function Chip({ icon, pressed, children, className, type = 'button', ...rest }: Props) {
  return (
    <button {...rest} type={type} className={[styles.chip, className ?? ''].join(' ')} aria-pressed={pressed}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
