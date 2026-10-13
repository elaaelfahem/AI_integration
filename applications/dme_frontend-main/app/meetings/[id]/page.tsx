import { AppShell } from '@/components/workspace/app-shell';
import { MeetingDetails } from '@/components/meetings/meeting-details';

export default async function MeetingDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <MeetingDetails meetingId={id} />
    </AppShell>
  );
}
