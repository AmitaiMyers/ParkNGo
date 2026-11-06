import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'small' | 'medium' | 'large';

interface CommonProps {
  variant: Variant;
  size?: Size;
  icon?: ReactNode;
  /** For icon-only buttons the label is required and becomes the accessible name. */
  iconOnly?: boolean;
  block?: boolean;
  children: ReactNode;
}

function classNames(variant: Variant, size: Size, iconOnly: boolean, block: boolean, extra: string | undefined): string {
  return [styles.button, styles[variant], size === 'large' ? styles.large : size === 'small' ? styles.small : '', iconOnly ? styles.iconOnly : '', block ? styles.block : '', extra ?? '']
    .filter((name) => name !== '')
    .join(' ');
}

interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'disabled'> {
  loading?: boolean;
  /** Disabled buttons stay focusable (aria-disabled) so their tooltip can explain why. */
  disabled?: boolean;
}

export function Button({ variant, size = 'medium', icon, iconOnly = false, block = false, loading = false, disabled = false, children, className, onClick, type = 'button', ...rest }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      className={classNames(variant, size, iconOnly, block, className)}
      aria-disabled={inactive ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      aria-label={iconOnly ? String(children) : rest['aria-label']}
      onClick={(event) => {
        if (inactive) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {!iconOnly && <span>{children}</span>}
    </button>
  );
}

interface LinkButtonProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  href: string;
}

/** An external link styled as a button (e.g. "Open in Waze"). */
export function LinkButton({ variant, size = 'medium', icon, iconOnly = false, block = false, children, className, ...rest }: LinkButtonProps) {
  return (
    <a {...rest} className={classNames(variant, size, iconOnly, block, className)} target="_blank" rel="noreferrer" aria-label={iconOnly ? String(children) : rest['aria-label']}>
      {icon}
      {!iconOnly && <span>{children}</span>}
    </a>
  );
}
