import { Clock, PackageCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Dispatch } from 'react';
import { formatTime } from '../../lib/i18n.ts';
import { VEHICLE_TYPES } from '../../lib/types.ts';
import type { Draft, FlowAction } from '../../state/planFlow.ts';
import { Chip } from '../../ui/Chip.tsx';
import { SegmentedControl } from '../../ui/SegmentedControl.tsx';
import { toDateTimeLocalValue, useI18n } from '../../ui.ts';
import { VEHICLE_ICONS } from '../modes.ts';
import styles from './Results.module.css';

const DEFAULT_RETURN_TIME = '17:00';

/** Vehicle, departure time, return trip and carry-on: every change re-plans in place. */
export function TripOptions({ draft, dispatch }: { draft: Draft; dispatch: Dispatch<FlowAction> }) {
  const { language, t } = useI18n();
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
      {draft.returnTime !== null && (
        <label className={styles.inlineField}>
          {t('returnAt')}
          <input type="time" value={draft.returnTime} onChange={(event) => event.target.value !== '' && dispatch({ type: 'setReturnTime', time: event.target.value })} />
        </label>
      )}
    </div>
  );
}
