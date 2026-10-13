'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, authApi } from '@/lib/api';
import type { MeetingStatus, ProspectingMeeting } from '@/types/auth';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { Messages } from '@/lib/i18n/messages';
import { CompanyMap } from '@/components/meetings/company-map-loader';

function statusLabelFor(status: MeetingStatus, t: Messages['meetingsPage']) {
  switch (status) {
    case 'SCHEDULED':
      return t.statusScheduled;
    case 'IN_PROGRESS':
      return t.statusInProgress;
    case 'COMPLETED':
      return t.statusCompleted;
    case 'CANCELLED':
      return t.statusCancelled;
    case 'NO_SHOW':
      return t.statusNoShow;
    default:
      return status;
  }
}

export function MeetingMapView({ meetingId }: { meetingId: string }) {
  const { messages } = useI18n();
  const t = messages.meetingDetailPage;
  const [meeting, setMeeting] = useState<ProspectingMeeting | null>(null);
  const [error, setError] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = loadedId !== meetingId;

  useEffect(() => {
    let cancelled = false;
    authApi
      .getMeeting(meetingId)
      .then((item) => {
        if (cancelled) return;
        setMeeting(item);
        setError('');
        setLoadedId(meetingId);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof ApiError ? cause.message : t.errorLoadFailed);
        setLoadedId(meetingId);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, t.errorLoadFailed]);

  if (loading) {
    return (
      <main className="meeting-detail-page">
        <div
          className="skeleton-box"
          style={{ width: '12rem', height: 20, marginBottom: '1.5rem' }}
        />
        <span className="skeleton-box" style={{ width: '100%', height: 600 }} />
      </main>
    );
  }

  if (error || !meeting) {
    return (
      <main className="meeting-detail-page">
        <div className="meeting-detail-card">
          <h2>{t.notFoundTitle}</h2>
          <p>{error || t.notFoundMessage}</p>
          <Link className="outline-button" href="/meetings">
            {t.breadcrumbCalendar}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="meeting-detail-page">
      <nav
        className="meeting-detail-breadcrumb"
        aria-label={messages.shared.breadcrumbAria}
      >
        <Link href="/meetings">{t.breadcrumbCalendar}</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/meetings/${meeting.id}`}>{t.breadcrumbDetails}</Link>
        <span aria-hidden="true">›</span>
        <span>{t.mapBreadcrumb}</span>
      </nav>
      <h1>
        <strong>{messages.meetingsPage.titleStrong}</strong>
        {messages.meetingsPage.titleRest}
      </h1>

      <CompanyMap company={meeting.company}>
        <div className="next-visit-card">
          <div className="next-visit-card-header">
            <strong>{t.nextVisitTitle}</strong>
            <span
              className={`b2b-status b2b-status-${meeting.status.toLowerCase()}`}
            >
              {statusLabelFor(meeting.status, messages.meetingsPage)}
            </span>
          </div>
          <ul className="next-visit-facts">
            <li>{new Date(meeting.scheduled_at).toLocaleDateString()}</li>
            <li>{new Date(meeting.scheduled_at).toLocaleTimeString()}</li>
            <li>
              {meeting.agent?.user
                ? `${meeting.agent.user.first_name} ${meeting.agent.user.last_name}`
                : '—'}
            </li>
          </ul>
        </div>
      </CompanyMap>
    </main>
  );
}
