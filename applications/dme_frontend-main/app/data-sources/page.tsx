import { AppShell } from '@/components/workspace/app-shell';
import { DataSourceManagement } from '@/components/data-sources/data-source-management';

export default function DataSourcesPage() {
  return (
    <AppShell>
      <DataSourceManagement />
    </AppShell>
  );
}
