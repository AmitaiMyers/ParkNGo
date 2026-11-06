// UI strings for English and Hebrew. The Hebrew dictionary is typed against the English
// keys, so the compiler reports any missing translation.

import type { Language } from './types.ts';
import type { ManeuverType } from './maneuvers.ts';

const en = {
  appTagline: 'Drive to free parking, skip the traffic, continue by public transport',
  from: 'From',
  to: 'To',
  searchPlaceholder: 'Address, place or station',
  myLocation: 'My location',
  locating: 'Locating…',
  vehicle: 'Vehicle',
  car: 'Car',
  bicycle: 'Bicycle',
  scooter: 'E-scooter',
  departure: 'Departure',
  leaveNow: 'Now',
  planReturn: 'Plan the trip back to my vehicle',
  returnAt: 'Return at',
  plan: 'Find park & ride',
  planning: 'Planning…',
  settings: 'Settings',
  back: 'Back',
  results: 'Options',
  fastest: 'Fastest',
  cheapest: 'Cheapest',
  balanced: 'Recommended',
  parkAt: 'Park at',
  parkingNear: 'Parking near {station}',
  walkToStation: '{meters} m to {station}',
  free: 'Free',
  priceUnknown: 'Price unknown',
  paidUnknownAmount: 'Paid (amount unknown)',
  perDay: '₪{amount}/day',
  minutes: '{n} min',
  arriveAt: 'Arrive {time}',
  transfers: '{n} transfers',
  walk: 'Walk {n} min',
  fuel: 'Fuel ₪{amount}',
  compareWith: 'Compare with',
  vehicleOnly_car: 'Drive all the way',
  vehicleOnly_bicycle: 'Ride all the way',
  vehicleOnly_scooter: 'Ride all the way',
  transitOnly: 'Public transport only',
  carryVehicle: 'Also: take it with me (folded) and ride the last stretch',
  carryOn: 'Take it with you & ride the last stretch',
  carryOnNote: 'Folding bicycles / scooters only. Check the operator’s rules for carrying it on board.',
  rideTo: 'Ride to {place}',
  continue: 'Continue',
  live_available: 'Live: spaces available',
  live_few: 'Live: few spaces left',
  live_full: 'Live: full',
  live_closed: 'Live: closed',
  live_open_no_count: 'Live: open',
  live_no_data: 'Live: no data',
  liveUpdated: 'updated {time}',
  skippedFull: '{n} lots skipped because they are full or closed right now',
  liveStatusUnavailable: 'Live parking status is unavailable right now ({error}); showing lots without it.',
  destinationParkingNotIncluded: 'Parking at the destination not included',
  noOptions: 'No park & ride option found. Try a larger walking distance, allow paid parking, or a different time (public transport does not run on Shabbat and holidays).',
  candidates: '{n} parking spots checked',
  returnTrip: 'Trip back to your vehicle',
  noReturnTrip: 'No public transport found for the return trip at that time.',
  openingHours: 'Opening hours: {hours}',
  parkAndRideLot: 'Official park & ride',
  navigate: 'Navigate',
  stepDrive: 'Drive',
  stepRide: 'Ride',
  stepTransit: 'Public transport',
  iParked: 'I parked — continue',
  arrivedDone: 'Finish',
  inMeters: 'In {distance}',
  offRoute: 'Off route — recalculating…',
  gpsWaiting: 'Waiting for GPS…',
  gpsDenied: 'Location access is needed for turn-by-turn guidance.',
  openInWaze: 'Open in Waze',
  openInGoogleMaps: 'Open in Google Maps',
  board: 'Board {line} towards {headsign}',
  boardLine: 'Board {line}',
  alightAt: 'Get off at {stop}',
  walkTo: 'Walk to {place}',
  destination: 'Destination',
  parkedBanner: 'Your vehicle is parked at {label}',
  navigateToVehicle: 'Navigate to it',
  forgetParking: 'Clear',
  language: 'Language',
  defaultVehicle: 'Default vehicle',
  pricePolicy: 'Parking price',
  freeOnly: 'Free only',
  allowPaid: 'Allow paid up to',
  maxWalk: 'Max walk from parking to station (m)',
  avoidZones: 'Avoid driving into',
  fuelCost: 'Fuel cost (₪ per km)',
  valueOfTime: 'Value of my time (₪ per hour)',
  voiceGuidance: 'Voice guidance',
  reportSpot: 'Suggest a parking spot',
  dataInfo: 'Parking data: {count} spots, updated {date}',
  attribution: 'Routing: Transitous · Map & parking data © OpenStreetMap contributors · Live lot status: Tel Aviv-Yafo Municipality',
  chooseFromList: 'Choose a place from the suggestions',
  maneuver_depart: 'Head out on {street}',
  maneuver_continue: 'Continue onto {street}',
  maneuver_slight_left: 'Keep left onto {street}',
  maneuver_slight_right: 'Keep right onto {street}',
  maneuver_left: 'Turn left onto {street}',
  maneuver_right: 'Turn right onto {street}',
  maneuver_sharp_left: 'Sharp left onto {street}',
  maneuver_sharp_right: 'Sharp right onto {street}',
  maneuver_uturn: 'Make a U-turn onto {street}',
  maneuver_arrive: 'Arrive at the parking',
  maneuverNoStreet_depart: 'Head out',
  maneuverNoStreet_continue: 'Continue',
  maneuverNoStreet_slight_left: 'Keep left',
  maneuverNoStreet_slight_right: 'Keep right',
  maneuverNoStreet_left: 'Turn left',
  maneuverNoStreet_right: 'Turn right',
  maneuverNoStreet_sharp_left: 'Sharp left',
  maneuverNoStreet_sharp_right: 'Sharp right',
  maneuverNoStreet_uturn: 'Make a U-turn',
  maneuverNoStreet_arrive: 'Arrive at the parking',
};

export type MessageKey = keyof typeof en;

const he: Record<MessageKey, string> = {
  appTagline: 'נוסעים עד חניה חינמית, עוקפים את הפקקים, ממשיכים בתחבורה ציבורית',
  from: 'מוצא',
  to: 'יעד',
  searchPlaceholder: 'כתובת, מקום או תחנה',
  myLocation: 'המיקום שלי',
  locating: 'מאתר…',
  vehicle: 'כלי רכב',
  car: 'רכב',
  bicycle: 'אופניים',
  scooter: 'קורקינט חשמלי',
  departure: 'יציאה',
  leaveNow: 'עכשיו',
  planReturn: 'לתכנן גם את הדרך חזרה לרכב',
  returnAt: 'חזרה בשעה',
  plan: 'חפש חנה וסע',
  planning: 'מתכנן…',
  settings: 'הגדרות',
  back: 'חזרה',
  results: 'אפשרויות',
  fastest: 'הכי מהיר',
  cheapest: 'הכי זול',
  balanced: 'מומלץ',
  parkAt: 'חונים ב',
  parkingNear: 'חניה ליד {station}',
  walkToStation: '{meters} מ׳ עד {station}',
  free: 'חינם',
  priceUnknown: 'מחיר לא ידוע',
  paidUnknownAmount: 'בתשלום (סכום לא ידוע)',
  perDay: '₪{amount} ליום',
  minutes: '{n} דק׳',
  arriveAt: 'הגעה {time}',
  transfers: '{n} החלפות',
  walk: 'הליכה {n} דק׳',
  fuel: 'דלק ₪{amount}',
  compareWith: 'להשוואה',
  vehicleOnly_car: 'נסיעה ברכב עד היעד',
  vehicleOnly_bicycle: 'רכיבה עד היעד',
  vehicleOnly_scooter: 'רכיבה עד היעד',
  transitOnly: 'רק תחבורה ציבורית',
  carryVehicle: 'גם: לקחת איתי (מקופל) ולרכוב בקטע האחרון',
  carryOn: 'לוקחים איתכם ורוכבים בקטע האחרון',
  carryOnNote: 'אופניים / קורקינט מתקפלים בלבד. בדקו את כללי המפעיל לגבי עלייה עם כלי רכב.',
  rideTo: 'רכיבה אל {place}',
  continue: 'המשך',
  live_available: 'בזמן אמת: יש מקום',
  live_few: 'בזמן אמת: מעט מקומות',
  live_full: 'בזמן אמת: מלא',
  live_closed: 'בזמן אמת: סגור',
  live_open_no_count: 'בזמן אמת: פתוח',
  live_no_data: 'בזמן אמת: אין מידע',
  liveUpdated: 'עודכן {time}',
  skippedFull: 'דילגנו על {n} חניונים שמלאים או סגורים כרגע',
  liveStatusUnavailable: 'סטטוס החניונים בזמן אמת אינו זמין כרגע ({error}); מוצגים חניונים בלעדיו.',
  destinationParkingNotIncluded: 'לא כולל חניה ביעד',
  noOptions: 'לא נמצאה אפשרות חנה וסע. נסו מרחק הליכה גדול יותר, לאפשר חניה בתשלום, או שעה אחרת (אין תחבורה ציבורית בשבת ובחגים).',
  candidates: 'נבדקו {n} חניות',
  returnTrip: 'הדרך חזרה לרכב',
  noReturnTrip: 'לא נמצאה תחבורה ציבורית לדרך חזרה בשעה זו.',
  openingHours: 'שעות פתיחה: {hours}',
  parkAndRideLot: 'חניון חנה וסע רשמי',
  navigate: 'ניווט',
  stepDrive: 'נסיעה',
  stepRide: 'רכיבה',
  stepTransit: 'תחבורה ציבורית',
  iParked: 'חניתי — להמשך',
  arrivedDone: 'סיום',
  inMeters: 'בעוד {distance}',
  offRoute: 'יצאת מהמסלול — מחשב מחדש…',
  gpsWaiting: 'ממתין ל-GPS…',
  gpsDenied: 'נדרשת הרשאת מיקום לניווט.',
  openInWaze: 'פתח ב-Waze',
  openInGoogleMaps: 'פתח ב-Google Maps',
  board: 'עלו על קו {line} לכיוון {headsign}',
  boardLine: 'עלו על קו {line}',
  alightAt: 'רדו בתחנה {stop}',
  walkTo: 'הליכה אל {place}',
  destination: 'היעד',
  parkedBanner: 'הרכב שלך חונה ב{label}',
  navigateToVehicle: 'נווט אליו',
  forgetParking: 'נקה',
  language: 'שפה',
  defaultVehicle: 'כלי רכב ברירת מחדל',
  pricePolicy: 'מחיר חניה',
  freeOnly: 'חינם בלבד',
  allowPaid: 'לאפשר בתשלום עד',
  maxWalk: 'מרחק הליכה מקסימלי מהחניה לתחנה (מ׳)',
  avoidZones: 'לא להיכנס עם הרכב אל',
  fuelCost: 'עלות דלק (₪ לק״מ)',
  valueOfTime: 'שווי הזמן שלי (₪ לשעה)',
  voiceGuidance: 'הנחיות קוליות',
  reportSpot: 'הצעת חניה חדשה',
  dataInfo: 'נתוני חניה: {count} חניות, עודכן {date}',
  attribution: 'ניתוב: Transitous · מפה ונתוני חניה © תורמי OpenStreetMap · סטטוס חניונים: עיריית תל אביב-יפו',
  chooseFromList: 'בחרו מקום מתוך ההצעות',
  maneuver_depart: 'צאו לדרך ב{street}',
  maneuver_continue: 'המשיכו אל {street}',
  maneuver_slight_left: 'הישארו משמאל אל {street}',
  maneuver_slight_right: 'הישארו מימין אל {street}',
  maneuver_left: 'פנו שמאלה אל {street}',
  maneuver_right: 'פנו ימינה אל {street}',
  maneuver_sharp_left: 'פנייה חדה שמאלה אל {street}',
  maneuver_sharp_right: 'פנייה חדה ימינה אל {street}',
  maneuver_uturn: 'בצעו פניית פרסה אל {street}',
  maneuver_arrive: 'הגעתם לחניה',
  maneuverNoStreet_depart: 'צאו לדרך',
  maneuverNoStreet_continue: 'המשיכו',
  maneuverNoStreet_slight_left: 'הישארו משמאל',
  maneuverNoStreet_slight_right: 'הישארו מימין',
  maneuverNoStreet_left: 'פנו שמאלה',
  maneuverNoStreet_right: 'פנו ימינה',
  maneuverNoStreet_sharp_left: 'פנייה חדה שמאלה',
  maneuverNoStreet_sharp_right: 'פנייה חדה ימינה',
  maneuverNoStreet_uturn: 'בצעו פניית פרסה',
  maneuverNoStreet_arrive: 'הגעתם לחניה',
};

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, he };

export type Params = Record<string, string | number>;

export function translate(language: Language, key: MessageKey, params: Params = {}): string {
  return DICTIONARIES[language][key].replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in params)) {
      throw new Error(`Missing parameter "${name}" for message "${key}"`);
    }
    return String(params[name]);
  });
}

export type Translate = (key: MessageKey, params?: Params) => string;

export function makeTranslator(language: Language): Translate {
  return (key, params) => translate(language, key, params);
}

export function maneuverText(t: Translate, type: ManeuverType, streetName: string): string {
  return streetName === '' ? t(`maneuverNoStreet_${type}`) : t(`maneuver_${type}`, { street: streetName });
}

export function formatTime(language: Language, date: Date): string {
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(date);
}

/** Arrival time; adds the weekday when it is not on the departure day (e.g. no service until after Shabbat). */
export function formatArrival(language: Language, arrival: Date, departure: Date): string {
  const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
  if (dayKey(arrival) === dayKey(departure)) {
    return formatTime(language, arrival);
  }
  const weekday = new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-IL', { weekday: 'short', timeZone: 'Asia/Jerusalem' }).format(arrival);
  return `${weekday} ${formatTime(language, arrival)}`;
}

export function formatDistance(language: Language, meters: number): string {
  if (meters >= 1000) {
    return language === 'he' ? `${(meters / 1000).toFixed(1)} ק״מ` : `${(meters / 1000).toFixed(1)} km`;
  }
  const rounded = Math.round(meters / 10) * 10;
  return language === 'he' ? `${rounded} מ׳` : `${rounded} m`;
}
