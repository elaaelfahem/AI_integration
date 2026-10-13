'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { Toast } from '@/components/auth/toast';
import {
  PromptDialog,
  RescheduleDialog,
  type PromptType,
} from '@/components/meetings/meeting-dialogs';
import { ApiError, authApi } from '@/lib/api';
import type {
  MeetingStatus,
  ProspectingMeeting,
  VisitType,
} from '@/types/auth';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate, type Messages } from '@/lib/i18n/messages';

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

function visitTypeLabelFor(type: VisitType, t: Messages['meetingDetailPage']) {
  switch (type) {
    case 'FIRST_VISIT':
      return t.visitTypeFirstVisit;
    case 'FOLLOW_UP':
      return t.visitTypeFollowUp;
    case 'DEMONSTRATION':
      return t.visitTypeDemonstration;
    case 'CONTRACT':
      return t.visitTypeContract;
    case 'OTHER':
      return t.visitTypeOther;
    default:
      return type;
  }
}

export function MeetingDetails({ meetingId }: { meetingId: string }) {
  const { messages } = useI18n();
  const t = messages.meetingDetailPage;
  const { account } = useAuth();
  const [meeting, setMeeting] = useState<ProspectingMeeting | null>(null);
  const [history, setHistory] = useState<ProspectingMeeting[]>([]);
  const [error, setError] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptType, setPromptType] = useState<PromptType | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [actionWorking, setActionWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((message: string) => {
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const loading = loadedId !== meetingId;

  useEffect(() => {
    let cancelled = false;
    authApi
      .getMeeting(meetingId)
      .then(async (item) => {
        if (cancelled) return;
        setMeeting(item);
        setError('');
        const companyMeetings = await authApi.listMeetings(
          `?companyId=${encodeURIComponent(item.company_id)}`,
        );
        if (cancelled) return;
        setHistory(
          companyMeetings
            .filter((entry) => entry.id !== item.id)
            .sort(
              (a, b) =>
                new Date(b.scheduled_at).getTime() -
                new Date(a.scheduled_at).getTime(),
            ),
        );
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

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setActionError(t.copyEmailError);
    }
  }

  async function updateMeeting(
    input: Record<string, unknown>,
    successMessage: string,
  ) {
    setActionWorking(true);
    setActionError('');
    try {
      const updated = await authApi.updateMeeting(meetingId, input);
      setMeeting(updated);
      pushToast(successMessage);
      setPromptType(null);
      setRescheduleOpen(false);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : messages.meetingsPage.errorUpdateFailed,
      );
    } finally {
      setActionWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="meeting-detail-page">
        <div
          className="skeleton-box"
          style={{ width: '12rem', height: 20, marginBottom: '1.5rem' }}
        />
        <div className="meeting-detail-grid">
          {[1, 2, 3, 4].map((index) => (
            <div className="meeting-detail-card" key={index}>
              <span
                className="skeleton-box"
                style={{ width: '100%', height: 120 }}
              />
            </div>
          ))}
        </div>
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

  const role = account?.role;
  const isActive =
    meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS';
  const canManage = role === 'MANAGER' || role === 'SUPERADMIN';
  const canStart = role === 'AGENT' && meeting.status === 'SCHEDULED';
  const canComplete = role === 'AGENT' && meeting.status === 'IN_PROGRESS';
  const canReschedule = canManage && meeting.status === 'SCHEDULED';
  const canCancel = canManage && isActive;

  const company = meeting.company;
  const visitTypeLabel = visitTypeLabelFor(meeting.visit_type, t);
  const location = [company.delegation, company.governorate]
    .filter(Boolean)
    .join(', ');
  const addressLine = [
    company.address,
    company.address && location && company.address.includes(location)
      ? null
      : location,
  ]
    .filter(Boolean)
    .join(', ');
  const mapHref = `/meetings/${meeting.id}/map`;

  return (
    <main className="meeting-detail-page">
      <nav
        className="meeting-detail-breadcrumb"
        aria-label={messages.shared.breadcrumbAria}
      >
        <Link href="/meetings">{t.breadcrumbCalendar}</Link>
        <span aria-hidden="true">›</span>
        <span>{t.breadcrumbDetails}</span>
      </nav>
      <h1>
        <strong>{messages.meetingsPage.titleStrong}</strong>
        {messages.meetingsPage.titleRest}
      </h1>

      <div className="meeting-detail-grid">
        <section className="meeting-detail-card">
          <h2>{t.enterpriseInfoTitle}</h2>
          <div className="enterprise-card-header">
            <span className="enterprise-card-icon" aria-hidden="true">
              <Image src="/images/Shape.svg" alt="" width={22} height={32} />
            </span>
            <div>
              <strong>{company.name}</strong>
              <span>{company.sector || t.sectorFallback}</span>
            </div>
          </div>
          <ul className="enterprise-card-facts">
            <li>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle
                  cx="12"
                  cy="9.5"
                  r="2.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              {addressLine || t.addressFallback}
            </li>
            <li>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="8"
                  r="3.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {company.contact_name || t.contactFallback}
            </li>
          </ul>
          <div className="enterprise-card-actions">
            {company.phone ? (
              <a className="orange-button" href={`tel:${company.phone}`}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.9 21 3 13.1 3 3.7c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                {t.callButton}
              </a>
            ) : null}
            {company.email ? (
              <div className="email-hover-action">
                <button type="button" className="orange-button">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="1.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m4 6.5 8 6 8-6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {t.emailButton}
                </button>
                <div className="email-hover-tooltip">
                  <span>{company.email}</span>
                  <button
                    type="button"
                    aria-label={t.copyEmailAriaLabel}
                    onClick={() => void copyEmail(company.email as string)}
                  >
                    {copied ? (
                      t.copiedLabel
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <rect
                          x="8"
                          y="8"
                          width="12"
                          height="12"
                          rx="1"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
            <Link className="outline-button" href={mapHref}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 3v16M15 5v16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
              {t.mapButton}
            </Link>
          </div>
        </section>

        <section className="meeting-detail-card">
          <h2>{t.logisticsTitle}</h2>
          <dl className="logistics-facts">
            <div>
              <dt>{t.dateTimeLabel}</dt>
              <dd>{new Date(meeting.scheduled_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt>{t.durationLabel}</dt>
              <dd>
                {interpolate(t.durationValue, {
                  minutes: String(meeting.duration_minutes),
                })}
              </dd>
            </div>
            <div>
              <dt>{t.typeLabel}</dt>
              <dd>{visitTypeLabel}</dd>
            </div>
            <div>
              <dt>{t.statusLabel}</dt>
              <dd>
                <span
                  className={`b2b-status b2b-status-${meeting.status.toLowerCase()}`}
                >
                  {statusLabelFor(meeting.status, messages.meetingsPage)}
                </span>
              </dd>
            </div>
          </dl>
          <hr />
          <div className="logistics-people">
            <div className="logistics-person-row">
              <span>{t.agentLabel}</span>
              {meeting.agent?.user ? (
                <>
                  <span className="logistics-avatar" aria-hidden="true">
                    {meeting.agent.user.first_name.charAt(0)}
                    {meeting.agent.user.last_name.charAt(0)}
                  </span>
                  <strong>
                    {meeting.agent.user.first_name}{' '}
                    {meeting.agent.user.last_name}
                  </strong>
                </>
              ) : (
                <strong>—</strong>
              )}
            </div>
            <div className="logistics-person-row">
              <span>{t.managerLabel}</span>
              {meeting.manager?.user ? (
                <>
                  <span className="logistics-avatar" aria-hidden="true">
                    {meeting.manager.user.first_name.charAt(0)}
                    {meeting.manager.user.last_name.charAt(0)}
                  </span>
                  <strong>
                    {meeting.manager.user.first_name}{' '}
                    {meeting.manager.user.last_name}
                  </strong>
                </>
              ) : (
                <strong>—</strong>
              )}
            </div>
          </div>
          {canStart || canComplete || canReschedule || canCancel ? (
            <>
              <hr />
              {actionError ? (
                <p className="users-error" role="alert">
                  {actionError}
                </p>
              ) : null}
              <div className="meeting-detail-actions">
                {canStart ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={actionWorking}
                    onClick={() =>
                      void updateMeeting(
                        { status: 'IN_PROGRESS' },
                        messages.meetingsPage.noticeStarted,
                      )
                    }
                  >
                    {messages.meetingsPage.actionStart}
                  </button>
                ) : null}
                {canComplete ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={actionWorking}
                    onClick={() => setPromptType('outcome')}
                  >
                    {messages.meetingsPage.actionComplete}
                  </button>
                ) : null}
                {canReschedule ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={actionWorking}
                    onClick={() => setRescheduleOpen(true)}
                  >
                    {messages.meetingsPage.actionReschedule}
                  </button>
                ) : null}
                {canCancel ? (
                  <button
                    type="button"
                    className="outline-button danger-action"
                    disabled={actionWorking}
                    onClick={() => setPromptType('cancel')}
                  >
                    {messages.meetingsPage.actionCancel}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <section className="meeting-detail-card meeting-detail-card-flush">
          <h2 className="meeting-detail-card-header">
            <span
              className="meeting-detail-card-header-icon"
              aria-hidden="true"
            />
            {t.historyTitle}
          </h2>
          {history.length ? (
            <table className="history-mini-table">
              <thead>
                <tr>
                  <th>{t.historyColDate}</th>
                  <th>{t.historyColAgent}</th>
                  <th>{t.historyColAction}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.scheduled_at).toLocaleDateString()}</td>
                    <td>
                      {item.agent?.user
                        ? `${item.agent.user.first_name} ${item.agent.user.last_name}`
                        : '—'}
                    </td>
                    <td>
                      <Link href={`/meetings/${item.id}`}>
                        {t.historyViewReport}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="meeting-detail-empty meeting-detail-card-padding">
              {t.historyEmpty}
            </p>
          )}
        </section>

        <section className="meeting-detail-card">
          <div className="ai-card-header">
            <h2>{t.aiTitle}</h2>
            {company.ai_score !== null ? (
              <span className="ai-score-badge">{company.ai_score}%</span>
            ) : null}
          </div>
          <p className="ai-summary-label">{t.aiSummaryLabel}</p>
          <p className="ai-summary-text">
            {company.ai_score === null
              ? t.aiNoScore
              : company.notes || t.aiNoSummary}
          </p>
          {company.ai_score !== null ? (
            <>
              <hr />
              <h3 className="ai-offer-title">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <circle cx="7" cy="7" r="1.4" fill="currentColor" />
                </svg>
                {t.aiOfferTitle}
              </h3>
              <ul className="ai-offer-list">
                <li>{t.aiOfferItem1}</li>
                <li>{t.aiOfferItem2}</li>
                <li>{t.aiOfferItem3}</li>
                <li>{t.aiOfferItem4}</li>
              </ul>
            </>
          ) : null}
        </section>
      </div>

      {promptType ? (
        <PromptDialog
          type={promptType}
          saving={actionWorking}
          onClose={() => setPromptType(null)}
          onSubmit={(value) => {
            if (promptType === 'outcome') {
              void updateMeeting(
                { status: 'COMPLETED', outcome: value },
                messages.meetingsPage.noticeCompleted,
              );
            } else {
              void updateMeeting(
                { status: 'CANCELLED', cancellationReason: value },
                messages.meetingsPage.noticeCancelled,
              );
            }
          }}
        />
      ) : null}
      {rescheduleOpen ? (
        <RescheduleDialog
          meeting={meeting}
          saving={actionWorking}
          onClose={() => setRescheduleOpen(false)}
          onSubmit={(scheduledAt) =>
            void updateMeeting(
              { scheduledAt },
              messages.meetingsPage.noticeRescheduled,
            )
          }
        />
      ) : null}
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          variant="success"
          message={toast.message}
          offset={index * 4.5}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </main>
  );
}
