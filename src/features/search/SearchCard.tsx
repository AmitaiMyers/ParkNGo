import { ArrowDownUp, ChevronDown, Search, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { Place } from '../../lib/types.ts';
import type { Draft, FlowAction } from '../../state/planFlow.ts';
import { Button } from '../../ui/Button.tsx';
import { Chip } from '../../ui/Chip.tsx';
import { useI18n } from '../../ui.ts';
import { PlaceCombobox } from './PlaceCombobox.tsx';
import type { ComboboxChoice } from './PlaceCombobox.tsx';
import styles from './Search.module.css';

interface Props {
  draft: Draft;
  recents: Place[];
  placement: 'floating' | 'embedded';
  online: boolean;
  dispatch: Dispatch<FlowAction>;
  onPlaceChosen: (place: Place) => void;
  onOpenSettings: () => void;
}

const QUICK_PICKS = 3;

export function SearchCard({ draft, recents, placement, online, dispatch, onPlaceChosen, onOpenSettings }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const originName = draft.origin.kind === 'current' ? t('myLocation') : draft.origin.place.name;
  const canSwap = draft.origin.kind === 'place' && draft.destination !== null;
  const collapsed = draft.destination !== null && !editing && !editingOrigin;
  const placementClass = placement === 'floating' ? styles.floating : styles.embedded;

  const settingsButton = (
    <Button variant="ghost" size="small" iconOnly icon={<Settings2 size={20} aria-hidden="true" />} onClick={onOpenSettings}>
      {t('settings')}
    </Button>
  );
  const swapButton = (
    <Button variant="ghost" size="small" iconOnly icon={<ArrowDownUp size={20} aria-hidden="true" />} disabled={!canSwap} title={canSwap ? undefined : t('swapNeedsPlaces')} onClick={() => dispatch({ type: 'swap' })}>
      {t('swap')}
    </Button>
  );

  const chooseDestination = (choice: ComboboxChoice) => {
    if (choice.kind !== 'place') {
      throw new Error('The destination must be a place');
    }
    onPlaceChosen(choice.place);
    dispatch({ type: 'setDestination', place: choice.place });
    setEditing(false);
  };

  const chooseOrigin = (choice: ComboboxChoice) => {
    if (choice.kind === 'place') {
      onPlaceChosen(choice.place);
    }
    dispatch({ type: 'setOrigin', origin: choice });
    setEditingOrigin(false);
  };

  if (collapsed) {
    return (
      <div className={[styles.pill, placementClass].join(' ')}>
        <button type="button" className={styles.pillText} onClick={() => setEditing(true)} aria-label={`${t('editTrip')}: ${originName} → ${draft.destination!.name}`}>
          <Search size={18} aria-hidden="true" />
          <span>
            <bdi>{originName}</bdi> → <bdi>{draft.destination!.name}</bdi>
          </span>
        </button>
        {swapButton}
        <Button variant="ghost" size="small" iconOnly icon={<X size={20} aria-hidden="true" />} onClick={() => dispatch({ type: 'setDestination', place: null })}>
          {t('clearTrip')}
        </Button>
        {settingsButton}
      </div>
    );
  }

  return (
    <div className={[styles.card, placementClass].join(' ')}>
      <div className={styles.topRow}>
        {editingOrigin ? (
          <PlaceCombobox label={t('chooseOrigin')} placeholder={t('chooseOrigin')} recents={recents} offerCurrentLocation autoFocus onChoose={chooseOrigin} />
        ) : (
          <button type="button" className={styles.originButton} onClick={() => setEditingOrigin(true)}>
            {t('from')} <strong>{originName}</strong>
            <span className="visually-hidden">, {t('changeOrigin')}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}
        {settingsButton}
      </div>
      <div className={styles.fieldRow}>
        <PlaceCombobox label={t('to')} placeholder={draft.destination === null ? t('whereTo') : draft.destination.name} recents={recents} offerCurrentLocation={false} autoFocus={editing} onChoose={chooseDestination} />
        {swapButton}
        {draft.destination !== null && (
          <Button variant="ghost" size="small" iconOnly icon={<X size={20} aria-hidden="true" />} onClick={() => setEditing(false)}>
            {t('close')}
          </Button>
        )}
      </div>
      {draft.destination === null && recents.length > 0 && (
        <div className={styles.recents}>
          {recents.slice(0, QUICK_PICKS).map((place) => (
            <Chip key={place.name} onClick={() => chooseDestination({ kind: 'place', place })}>
              {place.name}
            </Chip>
          ))}
        </div>
      )}
      {!online && <p className={styles.offline} role="status">{t('offline')}</p>}
    </div>
  );
}
