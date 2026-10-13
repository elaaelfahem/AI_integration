import { INTL_LOCALES, type Locale } from '@/lib/i18n/config';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "il y a 2 heures" style, or a short date after a week. */
export function relativeTime(iso: string, locale: Locale, justNow: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) return justNow;
  if (Math.abs(seconds) >= 7 * 86_400) {
    return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  }
  const format = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], {
    numeric: 'auto',
  });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return justNow;
}
