import { authApi } from '@/lib/api';
import { interpolate } from '@/lib/i18n/messages';

let cachedWhitelist: string | null = null;
let fetchPromise: Promise<string> | null = null;

export async function fetchEmailWhitelist(): Promise<string> {
  if (cachedWhitelist !== null) {
    return cachedWhitelist;
  }
  if (!fetchPromise) {
    fetchPromise = authApi
      .getEmailWhitelist()
      .then((whitelist) => {
        cachedWhitelist = whitelist || '*';
        return cachedWhitelist;
      })
      .catch(() => {
        cachedWhitelist = '*';
        return '*';
      })
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

export function getCachedWhitelist(): string {
  return cachedWhitelist ?? '*';
}

export function isEmailDomainAllowed(
  email: string,
  whitelistConfig = getCachedWhitelist(),
): boolean {
  if (
    !whitelistConfig ||
    whitelistConfig.trim() === '' ||
    whitelistConfig.trim() === '*'
  ) {
    return true;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const allowedDomains = whitelistConfig
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (allowedDomains.includes('*')) {
    return true;
  }

  return allowedDomains.some((domain) => {
    const targetDomain = domain.startsWith('@') ? domain : `@${domain}`;
    return normalizedEmail.endsWith(targetDomain);
  });
}

const DEFAULT_WHITELIST_ERROR_TEMPLATE =
  "Le domaine de l'adresse e-mail doit faire partie des domaines autorisés : {{domains}}";

export function getEmailDomainWhitelistErrorMessage(
  whitelistConfig = getCachedWhitelist(),
  template = DEFAULT_WHITELIST_ERROR_TEMPLATE,
): string {
  if (
    !whitelistConfig ||
    whitelistConfig.trim() === '' ||
    whitelistConfig.trim() === '*'
  ) {
    return '';
  }
  return interpolate(template, { domains: whitelistConfig });
}
