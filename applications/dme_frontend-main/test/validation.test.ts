import { describe, expect, it } from 'vitest';
import {
  getEmailDomainWhitelistErrorMessage,
  isEmailDomainAllowed,
} from '@/lib/validation';

describe('email whitelist validation', () => {
  it('allows every address for the wildcard configuration', () => {
    expect(isEmailDomainAllowed('person@example.com', '*')).toBe(true);
  });

  it('normalizes email and domain casing', () => {
    expect(isEmailDomainAllowed('Person@Orange.com', 'orange.com')).toBe(true);
  });

  it('rejects addresses outside configured domains', () => {
    expect(isEmailDomainAllowed('person@example.com', '@orange.com')).toBe(
      false,
    );
  });

  it('returns an actionable validation message', () => {
    expect(getEmailDomainWhitelistErrorMessage('@orange.com')).toContain(
      '@orange.com',
    );
  });
});
