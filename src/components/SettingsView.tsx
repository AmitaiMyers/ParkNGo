import { VEHICLE_TYPES } from '../lib/types.ts';
import type { AvoidZone, Language, ParkingDataset, Settings, VehicleType } from '../lib/types.ts';
import { REPORT_SPOT_URL, useI18n } from '../ui.ts';

interface Props {
  settings: Settings;
  dataset: ParkingDataset;
  onChange: (settings: Settings) => void;
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(parsed) && parsed >= 0) {
            onChange(parsed);
          }
        }}
      />
    </label>
  );
}

function toggleZone(ids: string[], zone: AvoidZone): string[] {
  return ids.includes(zone.id) ? ids.filter((id) => id !== zone.id) : [...ids, zone.id];
}

export function SettingsView({ settings, dataset, onChange }: Props) {
  const { language, t } = useI18n();
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <section className="card settings">
      <h2>{t('settings')}</h2>

      <label className="field">
        {t('language')}
        <select value={settings.language} onChange={(event) => update({ language: event.target.value as Language })}>
          <option value="he">עברית</option>
          <option value="en">English</option>
        </select>
      </label>

      <label className="field">
        {t('defaultVehicle')}
        <select value={settings.vehicle} onChange={(event) => update({ vehicle: event.target.value as VehicleType })}>
          {VEHICLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>{t('pricePolicy')}</legend>
        <label className="inline">
          <input type="radio" name="price" checked={settings.pricePolicy === 'free_only'} onChange={() => update({ pricePolicy: 'free_only' })} />
          {t('freeOnly')}
        </label>
        <label className="inline">
          <input type="radio" name="price" checked={settings.pricePolicy === 'allow_paid'} onChange={() => update({ pricePolicy: 'allow_paid' })} />
          {t('allowPaid')}
          <input
            type="number"
            className="narrow"
            min={0}
            value={settings.maxDailyPriceIls}
            disabled={settings.pricePolicy !== 'allow_paid'}
            onChange={(event) => event.target.value !== '' && update({ maxDailyPriceIls: Number(event.target.value) })}
          />
          ₪
        </label>
      </fieldset>

      <NumberField label={t('maxWalk')} value={settings.maxWalkMeters} step={100} onChange={(maxWalkMeters) => update({ maxWalkMeters })} />

      <fieldset className="field">
        <legend>{t('avoidZones')}</legend>
        {dataset.avoidZones.map((zone) => (
          <label key={zone.id} className="inline">
            <input type="checkbox" checked={settings.avoidZoneIds.includes(zone.id)} onChange={() => update({ avoidZoneIds: toggleZone(settings.avoidZoneIds, zone) })} />
            {zone.name[language]}
          </label>
        ))}
      </fieldset>

      <NumberField label={t('fuelCost')} value={settings.fuelCostPerKmIls} step={0.1} onChange={(fuelCostPerKmIls) => update({ fuelCostPerKmIls })} />
      <NumberField label={t('valueOfTime')} value={settings.valueOfTimeIlsPerHour} step={5} onChange={(valueOfTimeIlsPerHour) => update({ valueOfTimeIlsPerHour })} />

      <label className="inline">
        <input type="checkbox" checked={settings.voiceGuidance} onChange={(event) => update({ voiceGuidance: event.target.checked })} />
        {t('voiceGuidance')}
      </label>

      <p className="muted">{t('dataInfo', { count: dataset.spots.length, date: new Date(dataset.generatedAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-IL') })}</p>
      <p>
        <a href={REPORT_SPOT_URL} target="_blank" rel="noreferrer">
          ➕ {t('reportSpot')}
        </a>
      </p>
    </section>
  );
}
