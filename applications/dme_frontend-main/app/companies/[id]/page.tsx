import { AppShell } from '@/components/workspace/app-shell';
import { CompanyDetails } from '@/components/companies/company-details';

export default async function CompanyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <CompanyDetails companyId={id} />
    </AppShell>
  );
}
