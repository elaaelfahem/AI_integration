import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { dashboardPage } = await getServerMessages();
  return {
    title: dashboardPage.metaTitle,
    description: dashboardPage.metaDescription,
  };
}

export default function DashboardPage() {
  return <Dashboard />;
}
