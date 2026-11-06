import { useEffect, useId, useState } from 'react';
import { geocode } from '../lib/transitous.ts';
import type { Place } from '../lib/types.ts';
import { useI18n } from '../ui.ts';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  allowMyLocation: boolean;
}

export function PlaceInput({ label, value, onChange, allowMyLocation }: Props) {
  const { language, t } = useI18n();
  const inputId = useId();
  const [text, setText] = useState(value === null ? '' : value.name);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const query = text.trim();
  const isSelected = value !== null && value.name === text;

  useEffect(() => {
    if (isSelected || query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      geocode(query, language).then(
        (places) => {
          if (!cancelled) {
            setSuggestions(places);
            setError(null);
          }
        },
        (reason: Error) => {
          if (!cancelled) {
            setError(reason.message);
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, isSelected, language]);

  const choose = (place: Place) => {
    setText(place.name);
    setSuggestions([]);
    onChange(place);
  };

  const useMyLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        choose({ name: t('myLocation'), location: { lat: position.coords.latitude, lng: position.coords.longitude } });
      },
      (positionError) => {
        setLocating(false);
        setError(positionError.message);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="field place-input">
      <label htmlFor={inputId}>{label}</label>
      <div className="place-row">
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          placeholder={t('searchPlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (value !== null) {
              onChange(null);
            }
          }}
        />
        {allowMyLocation && (
          <button type="button" className="secondary" onClick={useMyLocation} disabled={locating}>
            {locating ? t('locating') : `◎ ${t('myLocation')}`}
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((place) => (
            <li key={`${place.location.lat},${place.location.lng},${place.name}`}>
              <button type="button" onClick={() => choose(place)}>
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isSelected && query.length >= MIN_QUERY_LENGTH && suggestions.length > 0 && <p className="hint">{t('chooseFromList')}</p>}
      {error !== null && <p className="error-text">{error}</p>}
    </div>
  );
}
