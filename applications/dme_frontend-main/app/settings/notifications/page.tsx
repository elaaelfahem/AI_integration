import type { Metadata } from 'next';
import { NotificationsPage } from '@/components/settings/notifications-page';
import { AppShell } from '@/components/workspace/app-shell';
import { getServerMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { notificationsPage } = await getServerMessages();
  return { title: notificationsPage.metaTitle };
}

export default function SettingsNotifications() {
  return (
    <AppShell>
      <NotificationsPage />
    </AppShell>
  );
}
