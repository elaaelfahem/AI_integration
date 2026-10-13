import { cookies } from 'next/headers';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
} from './config';

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  return cookieLocale && isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

export async function getServerMessages() {
  const { messages } = await import('./messages');
  return messages[await getServerLocale()];
}
