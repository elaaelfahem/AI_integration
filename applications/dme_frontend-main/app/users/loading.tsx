'use client';

import { useI18n } from '@/lib/i18n/i18n-context';

export default function UsersLoading() {
  const { messages } = useI18n();
  const label = messages.shared.loadingUsers;
  return (
    <main className="loading-screen" aria-busy="true" aria-label={label}>
      <div className="loading-line" />
      <p>{label}</p>
    </main>
  );
}
