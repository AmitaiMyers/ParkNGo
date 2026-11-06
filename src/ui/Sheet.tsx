import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import styles from './Sheet.module.css';

export type SnapPoint = 'peek' | 'half' | 'full';
const SNAP_ORDER: readonly SnapPoint[] = ['peek', 'half', 'full'];

/** Visible height of each snap point in px for the current viewport (mirrors Sheet.module.css). */
function snapHeights(): Record<SnapPoint, number> {
  const viewport = window.innerHeight;
  return { peek: 150, half: viewport * 0.55, full: viewport * 0.92 };
}

/** Nearest snap point to a visible height, biased by flick velocity (px/ms, positive = upward). */
export function nearestSnap(visible: number, velocity: number, heights: Record<SnapPoint, number>): SnapPoint {
  const FLICK_VELOCITY = 0.5;
  const current = SNAP_ORDER.reduce((best, snap) => (Math.abs(heights[snap] - visible) < Math.abs(heights[best] - visible) ? snap : best));
  const index = SNAP_ORDER.indexOf(current);
  if (velocity > FLICK_VELOCITY && heights[current] <= visible) {
    return SNAP_ORDER[Math.min(index + 1, SNAP_ORDER.length - 1)]!;
  }
  if (velocity < -FLICK_VELOCITY && heights[current] >= visible) {
    return SNAP_ORDER[Math.max(index - 1, 0)]!;
  }
  return current;
}

interface Props {
  label: string;
  /** Spoken state of the handle, e.g. "Options panel, half open". */
  handleLabel: string;
  snap: SnapPoint;
  onSnapChange: (snap: SnapPoint) => void;
  children: ReactNode;
}

interface Drag {
  startY: number;
  startVisible: number;
  lastY: number;
  lastTime: number;
  velocity: number;
}

export function Sheet({ label, handleLabel, snap, onSnapChange, children }: Props) {
  const [dragVisible, setDragVisible] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const visible = snapHeights()[snap];
    drag.current = { startY: event.clientY, startVisible: visible, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0 };
    setDragVisible(visible);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (state === null) {
      return;
    }
    const elapsed = Math.max(1, event.timeStamp - state.lastTime);
    state.velocity = (state.lastY - event.clientY) / elapsed;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
    const heights = snapHeights();
    setDragVisible(Math.min(heights.full, Math.max(heights.peek * 0.6, state.startVisible + (state.startY - event.clientY))));
  };

  const onPointerUp = () => {
    const state = drag.current;
    if (state === null || dragVisible === null) {
      return;
    }
    const moved = Math.abs(dragVisible - state.startVisible);
    drag.current = null;
    setDragVisible(null);
    // A tap on the handle (no real movement) toggles between half and full.
    onSnapChange(moved < 6 ? (snap === 'full' ? 'half' : 'full') : nearestSnap(dragVisible, state.velocity, snapHeights()));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SNAP_ORDER.indexOf(snap);
    if (event.key === 'ArrowUp') {
      onSnapChange(SNAP_ORDER[Math.min(index + 1, SNAP_ORDER.length - 1)]!);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      onSnapChange(SNAP_ORDER[Math.max(index - 1, 0)]!);
      event.preventDefault();
    }
  };

  const className = [styles.sheet, styles[snap], dragVisible === null ? '' : styles.dragging].join(' ');
  const style = dragVisible === null ? undefined : { transform: `translateY(calc(100% - ${dragVisible}px))` };

  return (
    <section className={className} style={style} aria-label={label}>
      <div className={styles.handleArea} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <button
          type="button"
          className={styles.handle}
          aria-label={handleLabel}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            // Pointer taps are handled by onPointerUp; this keeps Enter/Space working for keyboards.
            if (event.detail === 0) {
              onSnapChange(snap === 'full' ? 'half' : 'full');
            }
          }}
        />
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
