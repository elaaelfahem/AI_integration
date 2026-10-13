import { AppShell } from '@/components/workspace/app-shell';
import { UserProfile } from '@/components/user-profile/user-profile';

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <UserProfile userId={id} />
    </AppShell>
  );
}
