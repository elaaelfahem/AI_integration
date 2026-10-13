'use client';

import Image from 'next/image';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { AppShell } from '@/components/workspace/app-shell';
import { Toast } from '@/components/auth/toast';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import {
  PromptDialog,
  RescheduleDialog,
  type PromptType,
} from '@/components/meetings/meeting-dialogs';
import {
  DatePickerField,
  TimePickerField,
} from '@/components/shared/date-time-picker';
import { VisitReportDrawer } from '@/components/visit-reports/visit-report-drawer';
import { CompanyCombobox } from '@/components/shared/company-combobox';
import { Combobox } from '@/components/shared/combobox';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import type { Company, MeetingStatus, ProspectingMeeting } from '@/types/auth';

type Agent = {
  id: string;
  account: { id: string };
  first_name: string;
  last_name: string;
  email: string;
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  manager_id?: string | null;
  manager_account_id?: string | null;
};

type ViewMode = 'month' | 'week';

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function computeRange(reference: Date, view: ViewMode) {
  if (view === 'week') {
    const start = addDays(startOfDay(reference), -mondayIndex(reference));
    return { start, end: addDays(start, 6) };
  }
  const firstOfMonth = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    1,
  );
  const lastOfMonth = new Date(
    reference.getFullYear(),
    reference.getMonth() + 1,
    0,
  );
  const start = addDays(firstOfMonth, -mondayIndex(firstOfMonth));
  const end = addDays(lastOfMonth, 6 - mondayIndex(lastOfMonth));
  return { start, end };
}

function buildDays(start: Date, end: Date) {
  const days: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

function chunkWeeks(days: Date[]) {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function weekOfMonth(date: Date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekStart = addDays(firstOfMonth, -mondayIndex(firstOfMonth));
  const currentWeekStart = addDays(startOfDay(date), -mondayIndex(date));
  const diffDays = Math.round(
    (currentWeekStart.getTime() - firstWeekStart.getTime()) / 86400000,
  );
  return Math.floor(diffDays / 7) + 1;
}

export default function MeetingsPage() {
  const { messages, locale } = useI18n();
  const t = messages.meetingsPage;
  const { account } = useAuth();
  const [meetings, setMeetings] = useState<ProspectingMeeting[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [managers, setManagers] = useState<
    Array<{ id: string; firstName: string; lastName: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((message: string) => {
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const [statusFilter, setStatusFilter] = useState<'ALL' | MeetingStatus>(
    'ALL',
  );
  const [view, setView] = useState<ViewMode>('month');
  const [reference, setReference] = useState(() => new Date());
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [detailAnchor, setDetailAnchor] = useState<{
    top: number;
    left: number;
    bottom: number;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    meeting: ProspectingMeeting;
    type: PromptType;
  } | null>(null);
  const [rescheduleMeeting, setRescheduleMeeting] =
    useState<ProspectingMeeting | null>(null);
  const [dragConfirm, setDragConfirm] = useState<ConfirmDialogState | null>(
    null,
  );
  const [dragConfirmWorking, setDragConfirmWorking] = useState(false);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reportMeeting, setReportMeeting] = useState<ProspectingMeeting | null>(
    null,
  );

  const canSchedule =
    account?.role === 'MANAGER' || account?.role === 'SUPERADMIN';
  const canCreateMeeting = canSchedule || account?.role === 'AGENT';
  const { start, end } = useMemo(
    () => computeRange(reference, view),
    [reference, view],
  );
  const days = useMemo(() => buildDays(start, end), [start, end]);
  const weeks = useMemo(() => chunkWeeks(days), [days]);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = `?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(
        addDays(end, 1).toISOString(),
      )}`;
      const items = await authApi.listMeetings(query);
      setMeetings(items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [end, start, t.errorLoadFailed]);

  const loadStaticData = useCallback(async () => {
    try {
      const [companiesResult, agentsResult] = await Promise.all([
        authApi.listCompanies(),
        canSchedule ? authApi.listAgents() : Promise.resolve([]),
      ]);
      setCompanies(companiesResult);
      setAgents(agentsResult);
      if (account?.role === 'SUPERADMIN') {
        const users = await authApi.listUsers();
        setManagers(
          users
            .filter((user) => user.role === 'MANAGER')
            .map((user) => ({
              id: user.accountId ?? user.id,
              firstName: user.firstName,
              lastName: user.lastName,
            })),
        );
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorLoadFailed);
    }
  }, [account, canSchedule, t.errorLoadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMeetings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMeetings]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStaticData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStaticData]);

  useEffect(() => {
    if (!openDetailId) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest('.calendar-detail-popover') &&
        !target?.closest('.calendar-chip')
      ) {
        setOpenDetailId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDetailId]);

  const visibleMeetings = useMemo(
    () =>
      meetings.filter(
        (meeting) => statusFilter === 'ALL' || meeting.status === statusFilter,
      ),
    [meetings, statusFilter],
  );

  const agentsWithMeetings = useMemo(() => {
    const activeAgentIds = new Set(
      visibleMeetings.map((meeting) => meeting.agent_id),
    );
    return agents.filter((agent) => activeAgentIds.has(agent.account.id));
  }, [agents, visibleMeetings]);
  const showAgentColumn = canSchedule && agentsWithMeetings.length > 0;

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, ProspectingMeeting[]>();
    for (const meeting of visibleMeetings) {
      const key = startOfDay(new Date(meeting.scheduled_at)).toDateString();
      const list = map.get(key) ?? [];
      list.push(meeting);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );
    }
    return map;
  }, [visibleMeetings]);

  async function updateMeeting(
    meeting: ProspectingMeeting,
    input: Record<string, unknown>,
    successMessage: string,
  ) {
    setWorkingId(meeting.id);
    setError('');
    try {
      await authApi.updateMeeting(meeting.id, input);
      pushToast(successMessage);
      setOpenDetailId(null);
      setPromptState(null);
      setRescheduleMeeting(null);
      setDragConfirm(null);
      await loadMeetings();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorUpdateFailed);
    } finally {
      setWorkingId(null);
    }
  }

  const baseMonthLabel = new Intl.DateTimeFormat(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    {
      month: 'long',
      year: 'numeric',
    },
  ).format(reference);
  const periodLabel =
    view === 'week'
      ? `${baseMonthLabel} · ${interpolate(t.weekOfMonthLabel, { number: String(weekOfMonth(reference)) })}`
      : baseMonthLabel;

  const weekdayLabels = [
    t.weekdayMon,
    t.weekdayTue,
    t.weekdayWed,
    t.weekdayThu,
    t.weekdayFri,
    t.weekdaySat,
    t.weekdaySun,
  ];

  const statusTabs: { value: 'ALL' | MeetingStatus; label: string }[] = [
    { value: 'ALL', label: t.statusAll },
    { value: 'SCHEDULED', label: t.statusScheduled },
    { value: 'IN_PROGRESS', label: t.statusInProgress },
    { value: 'COMPLETED', label: t.statusCompleted },
    { value: 'CANCELLED', label: t.statusCancelled },
    { value: 'NO_SHOW', label: t.statusNoShow },
  ];

  function navigate(direction: -1 | 1) {
    setOpenDetailId(null);
    setReference((current) =>
      view === 'week'
        ? addDays(current, 7 * direction)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
  }

  const today = startOfDay(new Date());

  return (
    <AppShell>
      <main className="users-page">
        <header className="users-page-header">
          <div>
            <h1>
              <strong>{t.titleStrong}</strong>
              {t.titleRest}
            </h1>
            <p className="users-page-subtitle">{t.subtitle}</p>
          </div>
          <div className="users-page-actions">
            {canCreateMeeting ? (
              <button
                className="orange-button"
                type="button"
                onClick={() => setDrawerOpen(true)}
              >
                <span aria-hidden="true">+</span> {t.newMeeting}
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="calendar-toolbar">
          <div
            className="calendar-segmented"
            role="tablist"
            aria-label={t.statusFilterAriaLabel}
          >
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                className={statusFilter === tab.value ? 'active' : undefined}
                aria-selected={statusFilter === tab.value}
                onClick={() => {
                  setOpenDetailId(null);
                  setStatusFilter(tab.value);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="calendar-nav-group">
            <div className="calendar-nav">
              <button
                type="button"
                aria-label={t.prevPeriod}
                onClick={() => navigate(-1)}
              >
                ‹
              </button>
              <span className="calendar-nav-label">{periodLabel}</span>
              <button
                type="button"
                aria-label={t.nextPeriod}
                onClick={() => navigate(1)}
              >
                ›
              </button>
              <button
                type="button"
                className="calendar-today-button"
                onClick={() => {
                  setOpenDetailId(null);
                  setReference(new Date());
                }}
              >
                {t.todayButtonLabel}
              </button>
            </div>
            <div
              className="calendar-segmented"
              role="tablist"
              aria-label={t.viewToggleAriaLabel}
            >
              <button
                type="button"
                role="tab"
                className={view === 'month' ? 'active' : undefined}
                aria-selected={view === 'month'}
                onClick={() => {
                  setOpenDetailId(null);
                  setView('month');
                }}
              >
                {t.viewMonth}
              </button>
              <button
                type="button"
                role="tab"
                className={view === 'week' ? 'active' : undefined}
                aria-selected={view === 'week'}
                onClick={() => {
                  setOpenDetailId(null);
                  setView('week');
                }}
              >
                {t.viewWeek}
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-frame">
          <div
            className="calendar-grid"
            style={
              showAgentColumn
                ? { gridTemplateColumns: '11rem repeat(7, minmax(0, 1fr))' }
                : undefined
            }
          >
            {showAgentColumn ? (
              <div className="calendar-weekday">{t.agentColumnLabel}</div>
            ) : null}
            {weekdayLabels.map((label) => (
              <div className="calendar-weekday" key={label}>
                {label}
              </div>
            ))}
            {loading ? (
              <CalendarSkeleton
                weeks={weeks.length}
                showAgentColumn={showAgentColumn}
              />
            ) : !visibleMeetings.length ? null : (
              <>
                {showAgentColumn ? (
                  <div
                    className="calendar-agent-col-cell"
                    style={{
                      gridColumn: 1,
                      gridRow: `2 / span ${weeks.length}`,
                    }}
                  >
                    {agentsWithMeetings.map((agent) => (
                      <div className="calendar-agent-chip" key={agent.id}>
                        <span
                          className="calendar-agent-avatar"
                          aria-hidden="true"
                        >
                          {agent.first_name.charAt(0)}
                          {agent.last_name.charAt(0)}
                        </span>
                        <span className="calendar-agent-name">
                          {agent.first_name} {agent.last_name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {weeks.flatMap((week) =>
                  week.map((day) => {
                    const key = day.toDateString();
                    const dayMeetings = meetingsByDay.get(key) ?? [];
                    const outside =
                      view === 'month' &&
                      day.getMonth() !== reference.getMonth();
                    const isToday = isSameDay(day, today);
                    const visibleChips = dayMeetings.slice(0, 3);
                    const overflow = dayMeetings.length - visibleChips.length;
                    const isDropTarget = dragOverDay === key;
                    return (
                      <div
                        key={key}
                        className={`calendar-day${outside ? ' calendar-day-outside' : ''}${
                          isToday ? ' calendar-day-today' : ''
                        }${isDropTarget ? ' calendar-day-drop-target' : ''}`}
                        onDragOver={(event) => {
                          if (!event.dataTransfer.types.includes('text/plain'))
                            return;
                          event.preventDefault();
                          if (dragOverDay !== key) setDragOverDay(key);
                        }}
                        onDragLeave={() => {
                          setDragOverDay((current) =>
                            current === key ? null : current,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragOverDay(null);
                          const meetingId =
                            event.dataTransfer.getData('text/plain');
                          const meeting = visibleMeetings.find(
                            (item) => item.id === meetingId,
                          );
                          if (!meeting) return;
                          const original = new Date(meeting.scheduled_at);
                          if (isSameDay(original, day)) return;
                          const newDate = new Date(day);
                          newDate.setHours(
                            original.getHours(),
                            original.getMinutes(),
                            0,
                            0,
                          );
                          setDragConfirm({
                            title: t.dragConfirmTitle,
                            message: interpolate(t.dragConfirmMessage, {
                              company: meeting.company.name,
                              date: newDate.toLocaleString(),
                            }),
                            actionLabel: t.dragConfirmAction,
                            onConfirm: async () => {
                              setDragConfirmWorking(true);
                              try {
                                await updateMeeting(
                                  meeting,
                                  { scheduledAt: newDate.toISOString() },
                                  t.noticeRescheduled,
                                );
                              } finally {
                                setDragConfirmWorking(false);
                              }
                            },
                          });
                        }}
                      >
                        <span className="calendar-day-number">
                          {day.getDate()}
                        </span>
                        {visibleChips.map((meeting) => {
                          const draggable =
                            canSchedule && meeting.status === 'SCHEDULED';
                          return (
                            <button
                              key={meeting.id}
                              type="button"
                              className={`calendar-chip calendar-chip-${meeting.status.toLowerCase()}`}
                              title={meeting.company.name}
                              aria-label={t.chipAriaLabel}
                              draggable={draggable}
                              onDragStart={(event) => {
                                if (!draggable) return;
                                event.dataTransfer.setData(
                                  'text/plain',
                                  meeting.id,
                                );
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onClick={(event) => {
                                if (openDetailId === meeting.id) {
                                  setOpenDetailId(null);
                                  return;
                                }
                                const rect =
                                  event.currentTarget.getBoundingClientRect();
                                setDetailAnchor({
                                  top: rect.top,
                                  left: rect.left,
                                  bottom: rect.bottom,
                                });
                                setOpenDetailId(meeting.id);
                              }}
                            >
                              {meeting.company.name}
                              {canSchedule && meeting.agent?.user
                                ? ` · ${meeting.agent.user.first_name}`
                                : ''}
                            </button>
                          );
                        })}
                        {overflow > 0 ? (
                          <span className="calendar-chip-more">
                            {interpolate(t.moreChips, {
                              count: String(overflow),
                            })}
                          </span>
                        ) : null}
                        {dayMeetings.map((meeting) =>
                          openDetailId === meeting.id ? (
                            <MeetingDetailPopover
                              key={`detail-${meeting.id}`}
                              meeting={meeting}
                              role={account?.role}
                              selfAccountId={account?.id}
                              working={workingId === meeting.id}
                              anchor={detailAnchor}
                              onClose={() => setOpenDetailId(null)}
                              onStart={() =>
                                void updateMeeting(
                                  meeting,
                                  { status: 'IN_PROGRESS' },
                                  t.noticeStarted,
                                )
                              }
                              onComplete={() =>
                                setPromptState({ meeting, type: 'outcome' })
                              }
                              onCancel={() =>
                                setPromptState({ meeting, type: 'cancel' })
                              }
                              onReschedule={() => {
                                setOpenDetailId(null);
                                setRescheduleMeeting(meeting);
                              }}
                              onOpenReport={() => {
                                setOpenDetailId(null);
                                setReportMeeting(meeting);
                              }}
                            />
                          ) : null,
                        )}
                      </div>
                    );
                  }),
                )}
              </>
            )}
          </div>
          {!loading && !visibleMeetings.length ? (
            <div className="calendar-empty-state">
              <Image
                className="calendar-empty-illustration"
                src="/images/image%206.svg"
                alt=""
                width={130}
                height={56}
                aria-hidden="true"
              />
              <p className="calendar-empty-title">{t.emptyStateTitle}</p>
              <p className="calendar-empty-subtitle">{t.emptyStateSubtitle}</p>
              {canCreateMeeting ? (
                <button
                  className="orange-button"
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                >
                  <span aria-hidden="true">+</span> {t.newMeeting}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {drawerOpen ? (
          <MeetingDrawer
            accountRole={account?.role}
            selfAccountId={account?.id}
            managers={managers}
            companies={companies}
            agents={agents}
            onClose={() => setDrawerOpen(false)}
            saving={saving}
            onSubmit={async (input) => {
              setSaving(true);
              try {
                await authApi.createMeeting(input);
                setDrawerOpen(false);
                pushToast(t.noticeCreated);
                await loadMeetings();
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}

        {promptState ? (
          <PromptDialog
            type={promptState.type}
            saving={workingId === promptState.meeting.id}
            onClose={() => setPromptState(null)}
            onSubmit={(value) => {
              const meeting = promptState.meeting;
              if (promptState.type === 'outcome') {
                void updateMeeting(
                  meeting,
                  { status: 'COMPLETED', outcome: value },
                  t.noticeCompleted,
                );
              } else {
                void updateMeeting(
                  meeting,
                  { status: 'CANCELLED', cancellationReason: value },
                  t.noticeCancelled,
                );
              }
            }}
          />
        ) : null}
        <ConfirmDialog
          dialog={dragConfirm}
          isWorking={dragConfirmWorking}
          onClose={() => setDragConfirm(null)}
        />
        {rescheduleMeeting ? (
          <RescheduleDialog
            meeting={rescheduleMeeting}
            saving={workingId === rescheduleMeeting.id}
            onClose={() => setRescheduleMeeting(null)}
            onSubmit={(scheduledAt) => {
              void updateMeeting(
                rescheduleMeeting,
                { scheduledAt },
                t.noticeRescheduled,
              );
            }}
          />
        ) : null}
        {reportMeeting ? (
          <VisitReportDrawer
            meetingId={reportMeeting.id}
            companyName={reportMeeting.company.name}
            canEdit={
              account?.role === 'AGENT' && reportMeeting.agent_id === account.id
            }
            onClose={() => setReportMeeting(null)}
            onSaved={() => void loadMeetings()}
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
    </AppShell>
  );
}

const POPOVER_WIDTH = 280;
const POPOVER_MARGIN = 12;

function MeetingDetailPopover({
  meeting,
  role,
  selfAccountId,
  working,
  anchor,
  onClose,
  onStart,
  onComplete,
  onCancel,
  onReschedule,
  onOpenReport,
}: {
  meeting: ProspectingMeeting;
  role?: string;
  selfAccountId?: string;
  working: boolean;
  anchor: { top: number; left: number; bottom: number } | null;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  onOpenReport: () => void;
}) {
  const { messages } = useI18n();
  const t = messages.meetingsPage;
  const isActive =
    meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS';
  const isOwnMeeting = role === 'AGENT' && meeting.agent_id === selfAccountId;
  const canStart = isOwnMeeting && meeting.status === 'SCHEDULED';
  const canComplete = isOwnMeeting && meeting.status === 'IN_PROGRESS';
  const canManage = role === 'MANAGER' || role === 'SUPERADMIN';
  const canCancel = canManage && isActive;
  const canReschedule =
    (canManage || isOwnMeeting) && meeting.status === 'SCHEDULED';
  const canOpenReport =
    (isOwnMeeting || canManage) && meeting.status === 'COMPLETED';

  if (typeof document === 'undefined') return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = anchor
    ? Math.min(
        Math.max(anchor.left, POPOVER_MARGIN),
        viewportWidth - POPOVER_WIDTH - POPOVER_MARGIN,
      )
    : POPOVER_MARGIN;
  const fitsBelow = anchor ? anchor.bottom + 260 < viewportHeight : true;
  const style: CSSProperties = {
    position: 'fixed',
    left,
    width: POPOVER_WIDTH,
    maxHeight: `calc(100vh - ${2 * POPOVER_MARGIN}px)`,
    overflowY: 'auto',
    ...(anchor
      ? fitsBelow
        ? { top: anchor.bottom + 6 }
        : { bottom: viewportHeight - anchor.top + 6 }
      : { top: POPOVER_MARGIN }),
  };

  return createPortal(
    <div
      className="calendar-detail-popover"
      role="dialog"
      aria-label={meeting.title}
      style={style}
    >
      <button
        type="button"
        className="calendar-detail-close"
        onClick={onClose}
        aria-label={t.detailClose}
      >
        ×
      </button>
      <h4>{meeting.title}</h4>
      <dl>
        <div>
          <dt>{t.detailCompanyLabel}:</dt>
          <dd>{meeting.company.name}</dd>
        </div>
        <div>
          <dt>{t.detailAgentLabel}:</dt>
          <dd>
            {meeting.agent?.user
              ? `${meeting.agent.user.first_name} ${meeting.agent.user.last_name}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>{t.detailTimeLabel}:</dt>
          <dd>{new Date(meeting.scheduled_at).toLocaleString()}</dd>
        </div>
      </dl>
      {canStart ||
      canComplete ||
      canCancel ||
      canReschedule ||
      canOpenReport ? (
        <div className="calendar-detail-actions">
          {canStart ? (
            <button type="button" disabled={working} onClick={onStart}>
              {t.actionStart}
            </button>
          ) : null}
          {canComplete ? (
            <button type="button" disabled={working} onClick={onComplete}>
              {t.actionComplete}
            </button>
          ) : null}
          {canReschedule ? (
            <button type="button" disabled={working} onClick={onReschedule}>
              {t.actionReschedule}
            </button>
          ) : null}
          {canOpenReport ? (
            <button type="button" disabled={working} onClick={onOpenReport}>
              {messages.visitReportsPage.openReportButton}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="danger-action"
              disabled={working}
              onClick={onCancel}
            >
              {t.actionCancel}
            </button>
          ) : null}
        </div>
      ) : null}
      <Link className="calendar-detail-link" href={`/meetings/${meeting.id}`}>
        {t.viewDetailsLink}
      </Link>
    </div>,
    document.body,
  );
}

function MeetingDrawer({
  accountRole,
  selfAccountId,
  managers,
  companies,
  agents,
  onClose,
  onSubmit,
  saving,
}: {
  accountRole?: string;
  selfAccountId?: string;
  managers: Array<{ id: string; firstName: string; lastName: string }>;
  companies: Company[];
  agents: Agent[];
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const { messages } = useI18n();
  const t = messages.meetingsPage;
  const isAgent = accountRole === 'AGENT';
  const [closing, setClosing] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [agentId, setAgentId] = useState(() =>
    isAgent ? (selfAccountId ?? '') : '',
  );
  const [visitDate, setVisitDate] = useState<Date | null>(null);
  const [visitTime, setVisitTime] = useState<{
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  } | null>(null);
  const [error, setError] = useState('');
  const [assignPrompt, setAssignPrompt] = useState<{
    companyId: string;
    agentId: string;
    managerId?: string;
    title: string;
    scheduledAt: string;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);

  const availableAgents = agents.filter(
    (agent) =>
      agent.status === 'ACTIVE' &&
      (!managerId || agent.manager_id === managerId),
  );
  const selectedAgent = agents.find((agent) => agent.account.id === agentId);
  const selectedCompany = companies.find((company) => company.id === companyId);

  function close() {
    if (saving || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }

  async function submitMeeting(input: {
    companyId: string;
    agentId: string;
    managerId?: string;
    title: string;
    scheduledAt: string;
  }) {
    try {
      await onSubmit({
        companyId: input.companyId,
        agentId: input.agentId,
        ...(input.managerId && { managerId: input.managerId }),
        title: input.title,
        scheduledAt: input.scheduledAt,
        durationMinutes: 60,
      });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        /assigned to this manager/i.test(cause.message)
      ) {
        setAssignPrompt(input);
        return;
      }
      setError(cause instanceof ApiError ? cause.message : t.errorCreateFailed);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAssignPrompt(null);
    if (!visitDate || !visitTime) {
      setError(t.dialogRequiredHint);
      return;
    }
    const scheduledAt = new Date(visitDate);
    const hour24 =
      visitTime.period === 'PM'
        ? visitTime.hour === 12
          ? 12
          : visitTime.hour + 12
        : visitTime.hour === 12
          ? 0
          : visitTime.hour;
    scheduledAt.setHours(hour24, visitTime.minute, 0, 0);
    await submitMeeting({
      companyId,
      agentId,
      ...(managerId && { managerId }),
      title: `Visite - ${selectedCompany?.name ?? ''}`.trim(),
      scheduledAt: scheduledAt.toISOString(),
    });
  }

  async function handleAssignAndRetry() {
    if (!assignPrompt) return;
    setAssigning(true);
    setError('');
    try {
      await authApi.createAssignment({
        companyId: assignPrompt.companyId,
        agentId: assignPrompt.agentId,
        ...(assignPrompt.managerId && { managerId: assignPrompt.managerId }),
        scheduledAt: assignPrompt.scheduledAt,
        durationMinutes: 60,
        visitType: 'FIRST_VISIT',
        priority: 'MEDIUM',
      });
      const retryInput = assignPrompt;
      setAssignPrompt(null);
      await submitMeeting(retryInput);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorCreateFailed);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div
      className={`drawer-backdrop${closing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className={`user-drawer${closing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          disabled={saving}
          aria-label={t.drawerClose}
        >
          ×
        </button>
        <h2 id="meeting-drawer-title">{t.drawerTitle}</h2>
        <p>{t.drawerSubtitle}</p>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        {assignPrompt ? (
          <div className="assign-prompt">
            <p>{t.assignPromptMessage}</p>
            <button
              className="orange-button"
              type="button"
              disabled={assigning}
              onClick={() => void handleAssignAndRetry()}
            >
              {assigning ? t.assigning : t.assignPromptButton}
            </button>
          </div>
        ) : null}
        <hr />
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="drawer-field">
            <span>
              {t.fieldCompany} <b>*</b>
            </span>
            <CompanyCombobox
              companies={companies}
              value={companyId}
              onChange={setCompanyId}
              placeholder={t.fieldCompanyPlaceholder}
              disabled={saving}
              required
            />
          </label>
          {accountRole === 'SUPERADMIN' ? (
            <label className="drawer-field">
              <span>
                {t.fieldManager} <b>*</b>
              </span>
              <Combobox
                items={managers.map((manager) => ({
                  id: manager.id,
                  label: `${manager.firstName} ${manager.lastName}`,
                }))}
                value={managerId}
                onChange={(id) => {
                  setManagerId(id);
                  setAgentId('');
                }}
                placeholder={t.fieldManagerPlaceholder}
                disabled={saving}
                required
              />
            </label>
          ) : null}
          {isAgent ? null : (
            <label className="drawer-field">
              <span>{t.fieldAgent}</span>
              <Combobox
                items={availableAgents.map((agent) => ({
                  id: agent.account.id,
                  label: `${agent.first_name} ${agent.last_name}`,
                }))}
                value={agentId}
                onChange={setAgentId}
                placeholder={t.fieldAgentPlaceholder}
                disabled={
                  saving || (accountRole === 'SUPERADMIN' && !managerId)
                }
                required
              />
            </label>
          )}
          {selectedAgent ? <MeetingWorkloadCard agent={selectedAgent} /> : null}
          <label className="drawer-field">
            <span>
              {t.fieldDate} <b>*</b>
            </span>
            <div className="drawer-datetime-row">
              <DatePickerField
                value={visitDate}
                onChange={setVisitDate}
                min={new Date()}
                disabled={saving}
              />
              <TimePickerField
                value={visitTime}
                onChange={setVisitTime}
                disabled={saving}
              />
            </div>
          </label>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={close}
              disabled={saving}
            >
              {t.cancel}
            </button>
            <button className="orange-button" type="submit" disabled={saving}>
              {saving ? t.confirming : t.confirm}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function MeetingWorkloadCard({ agent }: { agent: Agent }) {
  const { messages } = useI18n();
  const t = messages.meetingsPage;
  const [agentMeetings, setAgentMeetings] = useState<
    ProspectingMeeting[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .listMeetings(`?agentId=${encodeURIComponent(agent.account.id)}`)
      .then((items) => {
        if (!cancelled) setAgentMeetings(items);
      })
      .catch(() => {
        if (!cancelled) setAgentMeetings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agent.account.id]);

  const today = new Date();
  const todayKey = today.toDateString();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const visitsToday =
    agentMeetings?.filter(
      (meeting) => new Date(meeting.scheduled_at).toDateString() === todayKey,
    ).length ?? null;
  const visitsThisWeek =
    agentMeetings?.filter(
      (meeting) => new Date(meeting.scheduled_at) >= startOfWeek,
    ).length ?? null;
  const pendingReports =
    agentMeetings?.filter((meeting) => meeting.status === 'IN_PROGRESS')
      .length ?? null;
  const isAvailable = visitsToday !== null ? visitsToday < 3 : null;

  return (
    <div className="workload-card">
      <div className="workload-card-header">
        <span className="workload-card-avatar" aria-hidden="true">
          {agent.first_name.charAt(0)}
          {agent.last_name.charAt(0)}
        </span>
        <div>
          <strong>{t.workloadTitle}</strong>
          <span>
            {agent.first_name} {agent.last_name}
          </span>
        </div>
      </div>
      <div className="workload-card-stats">
        <div>
          <small>{t.workloadVisitsToday}</small>
          <strong className="workload-stat-warning">
            {visitsToday ?? '—'}
          </strong>
        </div>
        <div>
          <small>{t.workloadVisitsWeek}</small>
          <strong>{visitsThisWeek ?? '—'}</strong>
        </div>
        <div>
          <small>{t.workloadPendingReports}</small>
          <strong className="workload-stat-danger">
            {pendingReports ?? '—'}
          </strong>
        </div>
        <div>
          <small>{t.workloadAvailability}</small>
          <strong className="workload-stat-success">
            {isAvailable === null
              ? '—'
              : isAvailable
                ? t.workloadAvailable
                : t.workloadBusy}
          </strong>
        </div>
      </div>
    </div>
  );
}

function CalendarSkeleton({
  weeks,
  showAgentColumn,
}: {
  weeks: number;
  showAgentColumn: boolean;
}) {
  return (
    <>
      {Array.from({ length: weeks }, (_, weekIndex) => [
        showAgentColumn ? (
          <div
            className="calendar-agent-col-cell"
            key={`skeleton-agentcol-${weekIndex}`}
          />
        ) : null,
        ...Array.from({ length: 7 }, (_, dayIndex) => (
          <div
            className="calendar-day"
            key={`skeleton-${weekIndex}-${dayIndex}`}
            aria-hidden="true"
          >
            <span
              className="skeleton-box"
              style={{ width: '1.2rem', height: 12, alignSelf: 'flex-end' }}
            />
          </div>
        )),
      ])}
    </>
  );
}
