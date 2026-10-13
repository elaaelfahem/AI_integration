'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import type { Locale } from '@/lib/i18n/config';

const OPTIONS: { value: Locale; labelKey: 'fr' | 'en'; short: string }[] = [
  { value: 'fr', labelKey: 'fr', short: 'FR' },
  { value: 'en', labelKey: 'en', short: 'EN' },
];

export function LanguageSwitcher() {
  const { locale, messages, setLocale } = useI18n();

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={messages.languageSwitcher.label}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`language-switcher-option${
            locale === option.value ? ' language-switcher-option-active' : ''
          }`}
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
          title={messages.languageSwitcher[option.labelKey]}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
