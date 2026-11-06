// Small UI helpers shared by several components.

import { createContext, createElement, Fragment, useContext } from 'react';
import type { ReactNode } from 'react';
import { formatTime, translateParts } from './lib/i18n.ts';
import type { MessageKey, Params, Translate } from './lib/i18n.ts';
import type { LiveLotStatus } from './lib/telAvivParking.ts';
import type { BadgeTone } from './ui/Badge.tsx';
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

export function priceBadge(spot: ParkingSpot, { t }: I18n): { tone: BadgeTone; label: string } {
  switch (spot.price.type) {
    case 'free':
      return { tone: 'free', label: t('free') };
    case 'unknown':
      return { tone: 'neutral', label: t('priceUnknown') };
    case 'paid':
      return { tone: 'neutral', label: spot.price.dailyIls === null ? t('paidUnknownAmount') : t('perDay', { amount: spot.price.dailyIls }) };
  }
}

/** "updated 08:12" for a live lot status, or null when the source gave no time. */
export function formatUpdated(status: LiveLotStatus, { language, t }: I18n): string | null {
  return status.updatedAt === null ? null : t('liveUpdated', { time: formatTime(language, status.updatedAt) });
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

/**
 * A translated message whose parameter values are wrapped in <bdi>, so a Hebrew place name inside an
 * English sentence (or the reverse) cannot reorder the text around it.
 */
export function richText({ language }: I18n, key: MessageKey, params: Params): ReactNode {
  return createElement(
    Fragment,
    null,
    ...translateParts(language, key, params).map((part, index) => (part.kind === 'param' ? createElement('bdi', { key: index }, part.value) : part.value)),
  );
}
