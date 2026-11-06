import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { VEHICLE_TYPES } from '../../lib/types.ts';
import type { Language, ParkingDataset, Settings, VehicleType } from '../../lib/types.ts';
import { Button } from '../../ui/Button.tsx';
import { REPORT_SPOT_URL, useI18n } from '../../ui.ts';
import styles from './Settings.module.css';

interface Props {
  open: boolean;
  settings: Settings;
  dataset: ParkingDataset;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

/** Native <dialog>: focus trap, Esc to close and focus return come from the browser. */
export function SettingsDialog({ open, settings, dataset, onChange, onClose }: Props) {
  const { language, t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      throw new Error('SettingsDialog is not mounted');
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const numberField = (key: 'maxWalkMeters' | 'fuelCostPerKmIls' | 'valueOfTimeIlsPerHour', label: string, step: number) => (
    <div className={styles.field}>
      <label htmlFor={`${titleId}-${key}`}>{label}</label>
      <input
        id={`${titleId}-${key}`}
        className={styles.control}
        type="number"
        min={0}
        step={step}
        value={settings[key]}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(value) && value >= 0) {
            update({ [key]: value });
          }
        }}
      />
    </div>
  );

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.header}>
        <h2 id={titleId}>{t('settings')}</h2>
        <Button variant="ghost" iconOnly icon={<X size={22} aria-hidden="true" />} onClick={onClose}>
          {t('close')}
        </Button>
      </div>
      <div className={styles.body}>
        <div className={styles.field}>
          <label htmlFor={`${titleId}-language`}>{t('language')}</label>
          <select id={`${titleId}-language`} className={styles.control} value={settings.language} onChange={(event) => update({ language: event.target.value as Language })}>
            <option value="he">עברית</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${titleId}-vehicle`}>{t('defaultVehicle')}</label>
          <select id={`${titleId}-vehicle`} className={styles.control} value={settings.vehicle} onChange={(event) => update({ vehicle: event.target.value as VehicleType })}>
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </select>
        </div>

        <fieldset className={styles.field}>
          <legend>{t('pricePolicy')}</legend>
          <label className={styles.inline}>
            <input type="radio" name="price" checked={settings.pricePolicy === 'free_only'} onChange={() => update({ pricePolicy: 'free_only' })} />
            {t('freeOnly')}
          </label>
          <label className={styles.inline}>
            <input type="radio" name="price" checked={settings.pricePolicy === 'allow_paid'} onChange={() => update({ pricePolicy: 'allow_paid' })} />
            {t('allowPaid')}
            <input
              className={`${styles.control} ${styles.narrow}`}
              type="number"
              min={0}
              aria-label={t('allowPaid')}
              value={settings.maxDailyPriceIls}
              disabled={settings.pricePolicy !== 'allow_paid'}
              onChange={(event) => event.target.value !== '' && update({ maxDailyPriceIls: Number(event.target.value) })}
            />
            ₪
          </label>
        </fieldset>

        {numberField('maxWalkMeters', t('maxWalk'), 100)}

        <fieldset className={styles.field}>
          <legend>{t('avoidZones')}</legend>
          {dataset.avoidZones.map((zone) => (
            <label key={zone.id} className={styles.inline}>
              <input
                type="checkbox"
                checked={settings.avoidZoneIds.includes(zone.id)}
                onChange={() =>
                  update({ avoidZoneIds: settings.avoidZoneIds.includes(zone.id) ? settings.avoidZoneIds.filter((id) => id !== zone.id) : [...settings.avoidZoneIds, zone.id] })
                }
              />
              {zone.name[language]}
            </label>
          ))}
        </fieldset>

        {numberField('fuelCostPerKmIls', t('fuelCost'), 0.1)}
        {numberField('valueOfTimeIlsPerHour', t('valueOfTime'), 5)}

        <label className={styles.inline}>
          <input type="checkbox" checked={settings.voiceGuidance} onChange={(event) => update({ voiceGuidance: event.target.checked })} />
          {t('voiceGuidance')}
        </label>

        <p className={styles.note}>{t('appearanceNote')}</p>
        <p className={styles.note}>{t('dataInfo', { count: dataset.spots.length, date: new Date(dataset.generatedAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-IL') })}</p>
        <a href={REPORT_SPOT_URL} target="_blank" rel="noreferrer">
          {t('reportSpot')}
        </a>
        <p className={styles.note}>{t('attribution')}</p>
      </div>
    </dialog>
  );
}
