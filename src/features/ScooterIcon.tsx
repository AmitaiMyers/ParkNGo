import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Lucide has no kick-scooter icon; this one is drawn in the same 24px / stroke style. */
export const Scooter = forwardRef<SVGSVGElement, LucideProps>(function Scooter({ size = 24, strokeWidth = 2, color = 'currentColor', ...rest }, ref) {
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <circle cx="5.5" cy="18" r="2.5" />
      <circle cx="18.5" cy="18" r="2.5" />
      <path d="M8 18h8" />
      <path d="M16 18 13.5 5H16" />
    </svg>
  );
}) as unknown as import('lucide-react').LucideIcon;
