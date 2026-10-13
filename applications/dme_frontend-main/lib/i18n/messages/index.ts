import type { Locale } from '../config';
import { en } from './en';
import { fr } from './fr';
import type { Messages } from './types';

export const messages: Record<Locale, Messages> = { fr, en };

export type { Messages } from './types';

export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
