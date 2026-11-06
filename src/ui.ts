// Small UI helpers shared by several components.

import { createContext, useContext } from 'react';
import type { Translate } from './lib/i18n.ts';
import type { Language, ParkingSpot } from './lib/types.ts';

export interface I18n {
  language: Language;
  t: Translate;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error('useI18n must be used inside I18nContext.Provider');
  }
  return value;
}

export function spotDisplayName(spot: ParkingSpot, { language, t }: I18n): string {
  if (language === 'en' && spot.nameEn !== null) {
    return spot.nameEn;
  }
  if (spot.name !== null) {
    return spot.name;
  }
  return t('parkingNear', { station: spot.nearestStation.name });
}

export function priceLabel(spot: ParkingSpot, { t }: I18n): string {
  switch (spot.price.type) {
    case 'free':
      return t('free');
    case 'unknown':
      return t('priceUnknown');
    case 'paid':
      return spot.price.dailyIls === null ? t('paidUnknownAmount') : t('perDay', { amount: spot.price.dailyIls });
  }
}

export const REPORT_SPOT_URL = 'https://github.com/AmitaiMyers/ParkNGo/issues/new?template=parking-spot.yml';

export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function googleMapsUrl(lat: number, lng: number, travelMode: 'driving' | 'bicycling' | 'transit' | 'walking'): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${travelMode}`;
}

/** Formats a Date as the value of an <input type="datetime-local"> in the device's time zone. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
