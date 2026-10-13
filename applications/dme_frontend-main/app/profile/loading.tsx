'use client';

import { useI18n } from '@/lib/i18n/i18n-context';

export default function ProfileLoading() {
  const { messages } = useI18n();
  const label = messages.shared.loadingProfile;
  return (
    <main className="loading-screen" aria-busy="true" aria-label={label}>
      <div className="loading-line" />
      <p>{label}</p>
    </main>
  );
}
