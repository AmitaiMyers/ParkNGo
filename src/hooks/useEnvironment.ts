import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export const useIsWide = (): boolean => useMediaQuery('(min-width: 900px)');
export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export const useOnline = (): boolean => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

/** The current time, refreshed every `intervalMs` (for countdowns and "updated N min ago"). */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export type Theme = 'light' | 'dark';

/** Dark when the system prefers it, or when `forceDark` (navigation at night). Applies `.theme-dark` to <html>. */
export function useTheme(forceDark: boolean): Theme {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme: Theme = systemDark || forceDark ? 'dark' : 'light';
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta === null) {
      throw new Error('index.html must have a theme-color meta tag');
    }
    meta.setAttribute('content', theme === 'dark' ? '#0a1015' : '#0b6e66');
  }, [theme]);
  return theme;
}

/** Max wait for an idle moment before mounting deferred work anyway. */
const IDLE_TIMEOUT_MS = 1500;

/**
 * True once the browser has been idle after first paint. Used to start the (heavy) map only after the
 * search field is interactive, so the first tap or keystroke never waits for map setup.
 */
export function useAfterIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // The DOM types claim requestIdleCallback always exists, but Safari does not have it.
    const requestIdle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined;
    if (requestIdle === undefined) {
      const timer = window.setTimeout(() => setReady(true), 200);
      return () => window.clearTimeout(timer);
    }
    const handle = requestIdle(() => setReady(true), { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }, []);
  return ready;
}
