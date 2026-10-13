'use client';

import { AppShell } from '@/components/workspace/app-shell';
import { useAuth } from '@/components/auth/auth-provider';
import { VisitReportsManagement } from '@/components/visit-reports/visit-reports-management';

export default function VisitReportsPage() {
  const { account } = useAuth();

  return (
    <AppShell>
      <VisitReportsManagement role={account?.role} />
    </AppShell>
  );
}
