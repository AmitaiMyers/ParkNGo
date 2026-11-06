import { Component, StrictMode, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/rubik';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App.tsx';
import styles from './ErrorScreen.module.css';
import { clearAllStoredData } from './lib/storage.ts';
import { Button } from './ui/Button.tsx';
import { ToastProvider } from './ui/Toast.tsx';

/**
 * Last-resort boundary: shows the error instead of a blank page and lets the user reset
 * stored data (e.g. settings saved by an older version that no longer validate).
 * Bilingual, because the language setting itself may be what failed to load.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <main className={styles.screen}>
        <h1>Something went wrong · משהו השתבש</h1>
        <pre className={styles.message}>{this.state.error.message}</pre>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try again · נסו שוב
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearAllStoredData();
              window.location.reload();
            }}
          >
            Reset app data · איפוס נתונים
          </Button>
        </div>
      </main>
    );
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<p className={styles.loading}>ParkNGo</p>}>
          <App />
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
