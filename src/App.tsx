import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { NavigationScreen } from './features/navigation/NavigationScreen.tsx';
import { PlanScreen } from './features/plan/PlanScreen.tsx';
import { SettingsDialog } from './features/settings/SettingsDialog.tsx';
import { useNow, useOnline, useTheme } from './hooks/useEnvironment.ts';
import { usePlanFlow } from './hooks/usePlanFlow.ts';
import { loadDataset } from './lib/dataset.ts';
import { makeTranslator } from './lib/i18n.ts';
import type { PlannerApi, TripOption } from './lib/planner.ts';
import { loadParkedVehicle, loadRecentPlaces, loadSavedPlaces, loadSettings, saveParkedVehicle, saveRecentPlaces, saveSavedPlaces, saveSettings, withRecentPlace } from './lib/storage.ts';
import type { SavedPlaceKind, SavedPlaces } from './lib/storage.ts';
import { isNight } from './lib/sun.ts';
import { fetchAhuzotStatuses } from './lib/telAvivParking.ts';
import { transitousApi } from './lib/transitous.ts';
import type { ParkedVehicle, Place, Settings, TripRequest } from './lib/types.ts';
import { useToast } from './ui/Toast.tsx';
import { I18nContext } from './ui.ts';
import type { I18n } from './ui.ts';

const plannerApi: PlannerApi = { ...transitousApi, lotStatuses: fetchAhuzotStatuses };

// Loaded once per page; errors surface through the ErrorBoundary via React's `use`.
const datasetPromise = loadDataset();

type Screen = { kind: 'plan' } | { kind: 'navigate'; option: TripOption; request: TripRequest };

export function App() {
  const dataset = use(datasetPromise);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [parked, setParked] = useState<ParkedVehicle | null>(loadParkedVehicle);
  const [recents, setRecents] = useState<Place[]>(loadRecentPlaces);
  const [saved, setSaved] = useState<SavedPlaces>(loadSavedPlaces);
  const [screen, setScreen] = useState<Screen>({ kind: 'plan' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const online = useOnline();
  const showToast = useToast();

  const i18n = useMemo<I18n>(() => ({ language: settings.language, t: makeTranslator(settings.language) }), [settings.language]);
  const { t } = i18n;

  // Memoized: a new object would make usePlanFlow re-plan on every render.
  const planContext = useMemo(() => ({ settings, dataset, api: plannerApi, t }), [settings, dataset, t]);
  const [flow, dispatch] = usePlanFlow(planContext);

  // Dark during navigation after sunset (checked every minute), otherwise follow the system.
  const now = useNow(60_000);
  const navigatingAtNight = screen.kind === 'navigate' && isNight(now, screen.request.origin.location);
  const theme = useTheme(navigatingAtNight);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'he' ? 'rtl' : 'ltr';
  }, [settings.language]);

  const changeSettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const rememberPlace = useCallback((place: Place) => {
    setRecents((current) => {
      const next = withRecentPlace(current, place);
      saveRecentPlaces(next);
      return next;
    });
  }, []);

  const changeSaved = (kind: SavedPlaceKind, place: Place | null) => {
    const next = { ...saved, [kind]: place };
    saveSavedPlaces(next);
    setSaved(next);
  };

  const replaceParked = (next: ParkedVehicle | null) => {
    saveParkedVehicle(next);
    setParked(next);
  };

  const parkWithUndo = (next: ParkedVehicle) => {
    const previous = parked;
    replaceParked(next);
    showToast({ message: t('parkingSaved', { label: next.label }), action: { label: t('undo'), onAction: () => replaceParked(previous) } });
  };

  return (
    <I18nContext.Provider value={i18n}>
      {screen.kind === 'plan' ? (
        <PlanScreen
          state={flow}
          dispatch={dispatch}
          settings={settings}
          dataset={dataset}
          saved={saved}
          recents={recents}
          parked={parked}
          theme={theme}
          online={online}
          onPlaceChosen={rememberPlace}
          onOpenSettings={() => setSettingsOpen(true)}
          onStart={(option, request) => setScreen({ kind: 'navigate', option, request })}
          onClearParked={() => replaceParked(null)}
        />
      ) : (
        <NavigationScreen
          option={screen.option}
          request={screen.request}
          settings={settings}
          theme={theme}
          onParked={parkWithUndo}
          onExit={() => setScreen({ kind: 'plan' })}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        dataset={dataset}
        saved={saved}
        onSavedChange={changeSaved}
        onChange={changeSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </I18nContext.Provider>
  );
}
