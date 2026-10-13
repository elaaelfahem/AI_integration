import { AppShell } from '@/components/workspace/app-shell';
import { CompanyManagement } from '@/components/companies/company-management';

export default function CompaniesPage() {
  return (
    <AppShell>
      <CompanyManagement />
    </AppShell>
  );
}
