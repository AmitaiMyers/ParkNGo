import { useState } from 'react';
import type { FormEvent } from 'react';
import { VEHICLE_TYPES } from '../lib/types.ts';
import type { Place, Settings, TripRequest, VehicleType } from '../lib/types.ts';
import { toDateTimeLocalValue, useI18n } from '../ui.ts';
import { PlaceInput } from './PlaceInput.tsx';

interface Props {
  settings: Settings;
  busy: boolean;
  onPlan: (request: TripRequest) => void;
}

/** Turns "HH:mm" into the first moment at that clock time that is after `after`. */
function nextTimeAfter(after: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (hours === undefined || minutes === undefined) {
    throw new Error(`Invalid time "${hhmm}"`);
  }
  const candidate = new Date(after);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate <= after) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function TripForm({ settings, busy, onPlan }: Props) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>(settings.vehicle);
  const [carryVehicle, setCarryVehicle] = useState(false);
  const [leaveNow, setLeaveNow] = useState(true);
  const [departureValue, setDepartureValue] = useState(() => toDateTimeLocalValue(new Date()));
  const [planReturn, setPlanReturn] = useState(false);
  const [returnTime, setReturnTime] = useState('17:00');

  const canSubmit = origin !== null && destination !== null && !busy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (origin === null || destination === null) {
      throw new Error('submit called without origin and destination');
    }
    const departure = leaveNow ? new Date() : new Date(departureValue);
    onPlan({
      origin,
      destination,
      vehicle,
      carryVehicle: vehicle !== 'car' && carryVehicle,
      departure,
      returnDeparture: planReturn ? nextTimeAfter(departure, returnTime) : null,
    });
  };

  return (
    <form className="card trip-form" onSubmit={submit}>
      <PlaceInput label={t('from')} value={origin} onChange={setOrigin} allowMyLocation />
      <PlaceInput label={t('to')} value={destination} onChange={setDestination} allowMyLocation={false} />

      <fieldset className="field">
        <legend>{t('vehicle')}</legend>
        <div className="segmented">
          {VEHICLE_TYPES.map((type) => (
            <label key={type} className={vehicle === type ? 'active' : ''}>
              <input type="radio" name="vehicle" value={type} checked={vehicle === type} onChange={() => setVehicle(type)} />
              {t(type)}
            </label>
          ))}
        </div>
        {vehicle !== 'car' && (
          <label className="inline">
            <input type="checkbox" checked={carryVehicle} onChange={(event) => setCarryVehicle(event.target.checked)} />
            {t('carryVehicle')}
          </label>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>{t('departure')}</legend>
        <div className="row">
          <label className="inline">
            <input type="checkbox" checked={leaveNow} onChange={(event) => setLeaveNow(event.target.checked)} />
            {t('leaveNow')}
          </label>
          {!leaveNow && <input type="datetime-local" value={departureValue} onChange={(event) => setDepartureValue(event.target.value)} required />}
        </div>
      </fieldset>

      <fieldset className="field">
        <label className="inline">
          <input type="checkbox" checked={planReturn} onChange={(event) => setPlanReturn(event.target.checked)} />
          {t('planReturn')}
        </label>
        {planReturn && (
          <label className="inline">
            {t('returnAt')}
            <input type="time" value={returnTime} onChange={(event) => setReturnTime(event.target.value)} required />
          </label>
        )}
      </fieldset>

      <button type="submit" className="primary" disabled={!canSubmit}>
        {busy ? t('planning') : t('plan')}
      </button>
    </form>
  );
}
