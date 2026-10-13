'use client';

import { AppShell } from '@/components/workspace/app-shell';
import { UserManagement } from '@/components/user-management/user-management';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n/i18n-context';

export default function UsersPage() {
  const { account } = useAuth();
  const { messages } = useI18n();

  if (account && account.role !== 'SUPERADMIN') {
    return (
      <AppShell>
        <main className="workspace-page">
          <section className="b2b-card">
            <h1>{messages.userManagement.unauthorizedTitle}</h1>
            <p>{messages.userManagement.unauthorizedMessage}</p>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <UserManagement />
    </AppShell>
  );
}
