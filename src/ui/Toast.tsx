import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

export interface ToastMessage {
  message: string;
  action: { label: string; onAction: () => void } | null;
}

const TOAST_DURATION_MS = 5000;

const ToastContext = createContext<((toast: ToastMessage) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  const show = useCallback((next: ToastMessage) => setToast({ ...next, id: Date.now() }), []);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.host} role="status" aria-live="polite">
        {toast !== null && (
          <div key={toast.id} className={styles.toast}>
            <span>{toast.message}</span>
            {toast.action !== null && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  toast.action!.onAction();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastMessage) => void {
  const show = useContext(ToastContext);
  if (show === null) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return show;
}
