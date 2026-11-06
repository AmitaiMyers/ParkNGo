// WAI-ARIA combobox (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): recents first, then search results.

import { LocateFixed, MapPin, RotateCcw, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { geocode } from '../../lib/transitous.ts';
import type { Place } from '../../lib/types.ts';
import { useI18n } from '../../ui.ts';
import styles from './Search.module.css';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export type ComboboxChoice = { kind: 'current' } | { kind: 'place'; place: Place };

interface Suggestion {
  key: string;
  choice: ComboboxChoice;
  title: string;
  subtitle: string | null;
  icon: ReactNode;
}

interface Props {
  label: string;
  placeholder: string;
  recents: Place[];
  /** Offer "My location" as the first suggestion (for the starting point). */
  offerCurrentLocation: boolean;
  autoFocus: boolean;
  onChoose: (choice: ComboboxChoice) => void;
}

export function PlaceCombobox({ label, placeholder, recents, offerCurrentLocation, autoFocus, onChoose }: Props) {
  const { language, t } = useI18n();
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const query = text.trim();

  useEffect(() => {
    if (autoFocus && input.current !== null) {
      input.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      geocode(query, language).then(
        (places) => {
          if (!cancelled) {
            setResults(places);
            setSearchError(null);
          }
        },
        (reason: Error) => !cancelled && setSearchError(reason.message),
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, language]);

  const lowerQuery = query.toLowerCase();
  const matchingRecents = recents.filter((place) => query === '' || place.name.toLowerCase().includes(lowerQuery));
  const recentNames = new Set(matchingRecents.map((place) => place.name));
  const suggestions: Suggestion[] = [
    ...(offerCurrentLocation && query === '' ? [{ key: 'current', choice: { kind: 'current' } as const, title: t('myLocation'), subtitle: null, icon: <LocateFixed size={18} aria-hidden="true" /> }] : []),
    ...matchingRecents.map((place) => ({ key: `recent:${place.name}`, choice: { kind: 'place' as const, place }, title: place.name, subtitle: t('recentPlaces'), icon: <RotateCcw size={18} aria-hidden="true" /> })),
    ...results
      .filter((place) => !recentNames.has(place.name))
      .map((place) => ({ key: `result:${place.name}:${place.location.lat}`, choice: { kind: 'place' as const, place }, title: place.name, subtitle: null, icon: <MapPin size={18} aria-hidden="true" /> })),
  ];
  const expanded = open && suggestions.length > 0;

  const choose = (suggestion: Suggestion) => {
    setText('');
    setOpen(false);
    setActive(-1);
    onChoose(suggestion.choice);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      setOpen(true);
      setActive((current) => (suggestions.length === 0 ? -1 : (current + 1) % suggestions.length));
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      setActive((current) => (suggestions.length === 0 ? -1 : (current - 1 + suggestions.length) % suggestions.length));
      event.preventDefault();
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      choose(suggestions[active]!);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className={styles.combobox}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <div className={styles.inputWrap}>
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          className={styles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          enterKeyHint="search"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul className={styles.listbox} id={listId} role="listbox" aria-label={label} hidden={!expanded}>
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.key}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === active}
            className={styles.option}
            // mousedown (not click) so the input's blur does not close the list first.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(suggestion);
            }}
          >
            {suggestion.icon}
            <span className={styles.optionText}>
              <span>
                <bdi>{suggestion.title}</bdi>
              </span>
              {suggestion.subtitle !== null && <small>{suggestion.subtitle}</small>}
            </span>
          </li>
        ))}
      </ul>
      {open && suggestions.length === 0 && query.length >= MIN_QUERY_LENGTH && (
        <p className={`${styles.listbox} ${styles.hint}`}>{searchError === null ? t('noSuggestions') : t('searchFailed', { error: searchError })}</p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {expanded && query.length >= MIN_QUERY_LENGTH ? t('suggestionsCount', { n: suggestions.length }) : ''}
      </p>
    </div>
  );
}
