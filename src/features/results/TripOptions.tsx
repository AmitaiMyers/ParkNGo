import { Banknote, Clock, Footprints, MapPinned, PackageCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { formatTime } from '../../lib/i18n.ts';
import { VEHICLE_TYPES } from '../../lib/types.ts';
import type { AvoidZone } from '../../lib/types.ts';
import type { Draft, FlowAction, PreferenceKey } from '../../state/planFlow.ts';
import { Chip } from '../../ui/Chip.tsx';
import { SegmentedControl } from '../../ui/SegmentedControl.tsx';
import { toDateTimeLocalValue, useI18n } from '../../ui.ts';
import { VEHICLE_ICONS } from '../modes.ts';
import styles from './Results.module.css';

const DEFAULT_RETURN_TIME = '17:00';

/** Vehicle, time, return trip, carry-on, and the per-trip "Are you OK with…" questions. Every change re-plans. */
export function TripOptions({ draft, zones, dispatch }: { draft: Draft; zones: AvoidZone[]; dispatch: Dispatch<FlowAction> }) {
  const { language, t } = useI18n();
  const zoneNames = zones.map((zone) => zone.name[language]).join(', ');
  const question = (key: PreferenceKey, icon: ReactNode, label: string) => (
    <Chip icon={icon} pressed={draft.preferences[key]} onClick={() => dispatch({ type: 'setPreference', key, value: !draft.preferences[key] })}>
      {label}
    </Chip>
  );
  const [editingTime, setEditingTime] = useState(false);
  const vehicleOptions = VEHICLE_TYPES.map((vehicle) => {
    const Icon = VEHICLE_ICONS[vehicle];
    return { value: vehicle, label: t(vehicle), icon: <Icon size={16} aria-hidden="true" /> };
  });
  const departureLabel = draft.departure.kind === 'now' ? t('leaveNow') : t('leaveAt', { time: formatTime(language, draft.departure.time) });

  return (
    <div className={styles.options} role="group" aria-label={t('tripOptions')}>
      <SegmentedControl label={t('vehicle')} options={vehicleOptions} value={draft.vehicle} onChange={(vehicle) => dispatch({ type: 'setVehicle', vehicle })} />
      <div className={styles.chips}>
        <Chip icon={<Clock size={16} aria-hidden="true" />} pressed={editingTime || draft.departure.kind === 'at'} onClick={() => setEditingTime(!editingTime)}>
          {departureLabel}
        </Chip>
        <Chip
          icon={<Undo2 size={16} aria-hidden="true" />}
          pressed={draft.returnTime !== null}
          onClick={() => dispatch({ type: 'setReturnTime', time: draft.returnTime === null ? DEFAULT_RETURN_TIME : null })}
        >
          {draft.returnTime === null ? t('returnChip') : t('returnAtChip', { time: draft.returnTime })}
        </Chip>
        {draft.vehicle !== 'car' && (
          <Chip icon={<PackageCheck size={16} aria-hidden="true" />} pressed={draft.carryVehicle} onClick={() => dispatch({ type: 'setCarryVehicle', carry: !draft.carryVehicle })}>
            {t('carryChip')}
          </Chip>
        )}
      </div>
      {editingTime && (
        <div className={styles.chips}>
          <Chip pressed={draft.departure.kind === 'now'} onClick={() => dispatch({ type: 'setDeparture', departure: { kind: 'now' } })}>
            {t('leaveNow')}
          </Chip>
          <label className={styles.inlineField}>
            {t('departure')}
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(draft.departure.kind === 'at' ? draft.departure.time : new Date())}
              onChange={(event) => {
                if (event.target.value !== '') {
                  dispatch({ type: 'setDeparture', departure: { kind: 'at', time: new Date(event.target.value) } });
                }
              }}
            />
          </label>
        </div>
      )}
      <div className={styles.questions} role="group" aria-labelledby="ok-with-heading">
        <span id="ok-with-heading" className={styles.questionsTitle}>
          {t('okWith')}
        </span>
        <div className={styles.chips}>
          {question('walkOverOneKm', <Footprints size={16} aria-hidden="true" />, t('pref_walkOverOneKm'))}
          {question('paidParking', <Banknote size={16} aria-hidden="true" />, t('pref_paidParking'))}
          {zones.length > 0 && question('parkInAvoidZones', <MapPinned size={16} aria-hidden="true" />, t('pref_parkInAvoidZones', { zone: zoneNames }))}
        </div>
      </div>
      {draft.returnTime !== null && (
        <label className={styles.inlineField}>
          {t('returnAt')}
          <input type="time" value={draft.returnTime} onChange={(event) => event.target.value !== '' && dispatch({ type: 'setReturnTime', time: event.target.value })} />
        </label>
      )}
    </div>
  );
}
