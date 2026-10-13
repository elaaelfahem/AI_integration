'use client';

import { useI18n } from '@/lib/i18n/i18n-context';

export default function GlobalError({ reset }: { reset: () => void }) {
  const t = useI18n().messages.shared;
  return (
    <main className="error-screen" role="alert">
      <h1>{t.errorTitle}</h1>
      <p>{t.errorIntro}</p>
      <button type="button" onClick={reset}>
        {t.tryAgain}
      </button>
    </main>
  );
}
