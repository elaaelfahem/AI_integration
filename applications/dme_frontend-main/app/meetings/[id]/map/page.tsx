import { AppShell } from '@/components/workspace/app-shell';
import { MeetingMapView } from '@/components/meetings/meeting-map-view';

export default async function MeetingMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <MeetingMapView meetingId={id} />
    </AppShell>
  );
}
