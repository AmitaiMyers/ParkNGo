import { use, useEffect, useMemo, useState } from 'react';
import { loadDataset } from './lib/dataset.ts';
import { makeTranslator } from './lib/i18n.ts';
import { planTrip } from './lib/planner.ts';
import type { PlanResult, TripOption } from './lib/planner.ts';
import { loadParkedVehicle, loadSettings, saveParkedVehicle, saveSettings } from './lib/storage.ts';
import { transitousApi } from './lib/transitous.ts';
import type { ParkedVehicle, Settings, TripRequest } from './lib/types.ts';
import { I18nContext, googleMapsUrl } from './ui.ts';
import type { I18n } from './ui.ts';
import { NavigationView } from './components/NavigationView.tsx';
import { ResultsView } from './components/ResultsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TripForm } from './components/TripForm.tsx';

// Loaded once per page; errors surface through the ErrorBoundary via React's `use`.
const datasetPromise = loadDataset();

type Screen = { name: 'plan' } | { name: 'settings' } | { name: 'navigate'; option: TripOption; request: TripRequest };

type Planning =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; request: TripRequest; result: PlanResult }
  | { status: 'error'; message: string };

export function App() {
  const dataset = use(datasetPromise);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [parked, setParked] = useState<ParkedVehicle | null>(loadParkedVehicle);
  const [screen, setScreen] = useState<Screen>({ name: 'plan' });
  const [planning, setPlanning] = useState<Planning>({ status: 'idle' });

  const i18n = useMemo<I18n>(() => ({ language: settings.language, t: makeTranslator(settings.language) }), [settings.language]);
  const { t } = i18n;

  // Each screen starts at the top (otherwise navigation opens scrolled down from the results list).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'he' ? 'rtl' : 'ltr';
  }, [settings.language]);

  const changeSettings = (next: Settings) => {
    saveSettings(next);
    setSettings(next);
  };

  const changeParked = (next: ParkedVehicle | null) => {
    saveParkedVehicle(next);
    setParked(next);
  };

  const plan = (request: TripRequest) => {
    setPlanning({ status: 'busy' });
    planTrip(request, settings, dataset.spots, dataset.avoidZones, transitousApi).then(
      (result) => setPlanning({ status: 'done', request, result }),
      (reason: Error) => setPlanning({ status: 'error', message: reason.message }),
    );
  };

  return (
    <I18nContext.Provider value={i18n}>
      <header className="app-header">
        <button type="button" className="brand" onClick={() => setScreen({ name: 'plan' })}>
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
          ParkNGo
        </button>
        {screen.name === 'plan' ? (
          <button type="button" className="secondary" onClick={() => setScreen({ name: 'settings' })}>
            ⚙ {t('settings')}
          </button>
        ) : (
          <button type="button" className="secondary" onClick={() => setScreen({ name: 'plan' })}>
            {t('back')}
          </button>
        )}
      </header>

      <main>
        {screen.name === 'plan' && (
          <>
            <p className="tagline">{t('appTagline')}</p>
            {parked !== null && (
              <div className="card parked">
                <span>🅿 {t('parkedBanner', { label: parked.label })}</span>
                <div className="row wrap">
                  <a className="button secondary" href={googleMapsUrl(parked.location.lat, parked.location.lng, 'transit')} target="_blank" rel="noreferrer">
                    {t('navigateToVehicle')}
                  </a>
                  <button type="button" className="link" onClick={() => changeParked(null)}>
                    {t('forgetParking')}
                  </button>
                </div>
              </div>
            )}
            <TripForm settings={settings} busy={planning.status === 'busy'} onPlan={plan} />
            {planning.status === 'error' && <p className="error-text">{planning.message}</p>}
            {planning.status === 'done' && (
              <ResultsView
                key={planning.result.options.map((o) => o.id).join('|')}
                result={planning.result}
                request={planning.request}
                settings={settings}
                onNavigate={(option) => setScreen({ name: 'navigate', option, request: planning.request })}
              />
            )}
          </>
        )}

        {screen.name === 'settings' && <SettingsView settings={settings} dataset={dataset} onChange={changeSettings} />}

        {screen.name === 'navigate' && (
          <NavigationView option={screen.option} request={screen.request} settings={settings} onParked={changeParked} onExit={() => setScreen({ name: 'plan' })} />
        )}
      </main>

      <footer className="muted small">{t('attribution')}</footer>
    </I18nContext.Provider>
  );
}
