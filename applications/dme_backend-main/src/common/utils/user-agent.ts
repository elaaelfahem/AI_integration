export interface ParsedUserAgent {
  device: string;
  browser: string;
}

const OS_PATTERNS: Array<[RegExp, string]> = [
  [/windows nt 10\.0/i, 'Windows 10/11'],
  [/windows nt/i, 'Windows'],
  // iPhone and iPad user agents also say "like Mac OS X": check them first.
  [/iphone/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/mac os x/i, 'macOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/linux/i, 'Linux'],
];

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/edg\/([\d.]+)/i, 'Edge'],
  [/opr\/([\d.]+)/i, 'Opera'],
  [/chrome\/([\d.]+)/i, 'Chrome'],
  [/crios\/([\d.]+)/i, 'Chrome'],
  [/fxios\/([\d.]+)/i, 'Firefox'],
  [/firefox\/([\d.]+)/i, 'Firefox'],
  [/version\/([\d.]+).*safari/i, 'Safari'],
  [/safari\/([\d.]+)/i, 'Safari'],
];

export function parseUserAgent(userAgent?: string | null): ParsedUserAgent {
  if (!userAgent) {
    return { device: 'Unknown device', browser: 'Unknown browser' };
  }

  const osMatch = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent));
  const device = osMatch ? osMatch[1] : 'Unknown device';

  const browserMatch = BROWSER_PATTERNS.find(([pattern]) =>
    pattern.test(userAgent),
  );
  let browser = 'Unknown browser';
  if (browserMatch) {
    const [pattern, name] = browserMatch;
    const versionMatch = pattern.exec(userAgent);
    const version = versionMatch?.[1]?.split('.')[0];
    browser = version ? `${name} ${version}` : name;
  }

  const isMobileSafari =
    browser === 'Safari' && (/iphone|ipad/i.test(userAgent) || false);
  if (isMobileSafari) {
    browser = `Mobile ${browser}`;
  }

  return { device, browser };
}
