import { Component, StrictMode, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App.tsx';
import { clearAllStoredData } from './lib/storage.ts';

/**
 * Last-resort boundary: shows the error instead of a blank page and lets the user reset
 * stored data (e.g. settings saved by an older version that no longer validate).
 * Shown bilingually because the language setting itself may be what failed to load.
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
      <main className="card">
        <h2>Something went wrong · משהו השתבש</h2>
        <pre className="error-text">{this.state.error.message}</pre>
        <div className="row wrap">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Try again · נסו שוב
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              clearAllStoredData();
              window.location.reload();
            }}
          >
            Reset app data · איפוס נתונים
          </button>
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
      <Suspense fallback={<p className="loading">ParkNGo…</p>}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
