export function isEmailDomainAllowed(
  email: string,
  whitelistConfig?: string,
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
