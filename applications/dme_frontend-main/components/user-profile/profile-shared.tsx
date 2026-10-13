'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import type { Messages } from '@/lib/i18n/messages';
import { authApi } from '@/lib/api';
import type { ConnectionEvent } from '@/types/auth';

export function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="profile-field">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="profile-metric">
      <div className="profile-metric-info">
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <span
        className="profile-metric-icon"
        style={{
          maskImage: `url('${icon}')`,
          WebkitMaskImage: `url('${icon}')`,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export function formatLastConnection(
  timestamp: string | null | undefined,
  isOnline: boolean | undefined,
  labels: Messages['profile'],
): string {
  if (isOnline && timestamp) {
    return labels.onlineNow;
  }
  if (!timestamp) {
    return labels.neverConnected;
  }
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (isNaN(diffMs) || diffMs < 0) return labels.justNow;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return labels.lessThanAMinuteAgo;
  if (minutes < 60)
    return interpolate(minutes > 1 ? labels.minutesAgo : labels.minuteAgo, {
      count: minutes,
    });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return interpolate(hours > 1 ? labels.hoursAgo : labels.hourAgo, {
      count: hours,
    });
  const days = Math.floor(hours / 24);
  return interpolate(days > 1 ? labels.daysAgo : labels.dayAgo, {
    count: days,
  });
}

export function TeamOverview({
  userId,
  assignmentAccountId,
  role,
  managerName,
}: {
  userId: string;
  assignmentAccountId?: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
  managerName?: string | null;
}) {
  const { messages } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [companiesAssigned, setCompaniesAssigned] = useState(0);
  const [teamMembers, setTeamMembers] = useState(0);
  const [visitsPlannedToday, setVisitsPlannedToday] = useState(0);
  const [visitsCompleted, setVisitsCompleted] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setIsLoading(true);
        setHasError(false);
      }
    });

    const requests: [
      ReturnType<typeof authApi.listAssignments>,
      ReturnType<typeof authApi.listAgents> | Promise<null>,
    ] = [
      authApi.listAssignments(),
      role === 'MANAGER' ? authApi.listAgents() : Promise.resolve(null),
    ];

    Promise.all(requests)
      .then(([assignments, agents]) => {
        if (cancelled) return;
        const scoped =
          role === 'ADMIN'
            ? assignments
            : assignments.filter((assignment) =>
                role === 'AGENT'
                  ? assignment.agent_id === (assignmentAccountId ?? userId)
                  : assignment.manager_id === (assignmentAccountId ?? userId),
              );
        const distinctCompanies = new Set(
          scoped.map((assignment) => assignment.company.id),
        );
        const today = new Date().toDateString();
        const plannedToday = scoped.filter(
          (assignment) =>
            new Date(assignment.scheduled_at).toDateString() === today &&
            assignment.status !== 'COMPLETED' &&
            assignment.status !== 'CANCELLED',
        ).length;
        const completed = scoped.filter(
          (assignment) => assignment.status === 'COMPLETED',
        ).length;

        setCompaniesAssigned(distinctCompanies.size);
        setVisitsPlannedToday(plannedToday);
        setVisitsCompleted(completed);

        if (role === 'MANAGER' && agents) {
          setTeamMembers(
            agents.filter((agent) =>
              'manager_id' in agent ? agent.manager_id === userId : true,
            ).length,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentAccountId, userId, role]);

  return (
    <section className="profile-card profile-team">
      <h2>
        <span
          className="profile-h2-mask-icon"
          style={{
            maskImage: "url('/users.svg')",
            WebkitMaskImage: "url('/users.svg')",
          }}
          aria-hidden="true"
        />
        <span>{messages.profile.teamOverviewTitle}</span>
      </h2>
      <Metric
        label={messages.profile.metricCompaniesAssigned}
        value={isLoading || hasError ? '—' : String(companiesAssigned)}
        icon="/enterprise-2.svg"
      />
      {role === 'MANAGER' ? (
        <Metric
          label={messages.profile.metricTeamMembers}
          value={
            isLoading || hasError
              ? '—'
              : `${teamMembers} ${messages.profile.agentsUnit}`
          }
          icon="/users.svg"
        />
      ) : null}
      {role === 'AGENT' ? (
        <Metric
          label={messages.profile.metricManager}
          value={managerName ?? messages.profile.noManagerAssigned}
          icon="/users.svg"
        />
      ) : null}
      <Metric
        label={messages.profile.metricVisitsPlannedToday}
        value={isLoading || hasError ? '—' : String(visitsPlannedToday)}
        icon="/calendar-2.svg"
      />
      <Metric
        label={messages.profile.metricVisitsCompleted}
        value={isLoading || hasError ? '—' : String(visitsCompleted)}
        icon="/check-2.svg"
      />
    </section>
  );
}

export function TeamOverviewSkeleton() {
  const { messages } = useI18n();
  const rows = [
    {
      label: messages.profile.metricCompaniesAssigned,
      icon: '/enterprise-2.svg',
      width: 30,
    },
    {
      label: messages.profile.metricTeamMembers,
      icon: '/users.svg',
      width: 60,
    },
    {
      label: messages.profile.metricVisitsPlannedToday,
      icon: '/calendar-2.svg',
      width: 25,
    },
    {
      label: messages.profile.metricVisitsCompleted,
      icon: '/check-2.svg',
      width: 35,
    },
  ];
  return (
    <section className="profile-card profile-team">
      <h2>
        <span
          className="profile-h2-mask-icon"
          style={{
            maskImage: "url('/users.svg')",
            WebkitMaskImage: "url('/users.svg')",
          }}
          aria-hidden="true"
        />
        <span>{messages.profile.teamOverviewTitle}</span>
      </h2>
      {rows.map((row) => (
        <div className="profile-metric" key={row.label}>
          <div className="profile-metric-info">
            <small>{row.label}</small>
            <strong style={{ marginTop: 4 }}>
              <span
                className="skeleton-box"
                style={{ width: row.width, height: 20 }}
              />
            </strong>
          </div>
          <span
            className="profile-metric-icon"
            style={{
              maskImage: `url('${row.icon}')`,
              WebkitMaskImage: `url('${row.icon}')`,
            }}
            aria-hidden="true"
          />
        </div>
      ))}
    </section>
  );
}

function getStatusLabel(
  status: ConnectionEvent['status'],
  messages: Messages['profile'],
): string {
  if (status === 'SUCCESS') return messages.statusSuccessPill;
  if (status === 'MFA_REQUIRED') return messages.statusMfaPill;
  if (status === 'PASSWORD_CHANGED') return messages.statusPasswordChangedPill;
  return messages.statusFailurePill;
}

function getStatusVariant(
  status: ConnectionEvent['status'],
): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'MFA_REQUIRED') return 'warning';
  if (status === 'PASSWORD_CHANGED') return 'info';
  return 'danger';
}

function formatConnectionDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ConnectionHistory({
  userId,
  showSkeleton,
}: {
  userId?: string;
  showSkeleton?: boolean;
}) {
  const { messages, locale } = useI18n();
  const [events, setEvents] = useState<ConnectionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'success' | 'warning' | 'danger' | 'info'
  >('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const pageSize = 8;

  useEffect(() => {
    if (showSkeleton) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoading(true);
      setError(null);
    });
    const request = userId
      ? authApi.getConnectionHistory(userId)
      : authApi.getOwnConnectionHistory();
    request
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setError(messages.profile.historyLoadError);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, messages, showSkeleton]);

  const displaySkeleton = showSkeleton || isLoading;

  const rows = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        date: formatConnectionDate(event.createdAt, locale),
        device: event.device,
        browser: event.browser,
        ip: event.ipAddress ?? '—',
        variant: getStatusVariant(event.status),
        statusLabel: getStatusLabel(event.status, messages.profile),
      })),
    [events, locale, messages],
  );

  const filteredLogs = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') {
      list = list.filter((item) => item.variant === statusFilter);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (item) =>
        item.date.toLowerCase().includes(q) ||
        item.device.toLowerCase().includes(q) ||
        item.browser.toLowerCase().includes(q) ||
        item.ip.toLowerCase().includes(q) ||
        item.statusLabel.toLowerCase().includes(q),
    );
  }, [rows, search, statusFilter]);

  const total = filteredLogs.length;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const currentPage = Math.min(page, maxPage);
  const paginatedLogs = filteredLogs.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const endIdx = Math.min((currentPage + 1) * pageSize, total);

  return (
    <section className="profile-history-card" aria-labelledby="history-title">
      <div className="history-top-bar">
        <h2 id="history-title">{messages.profile.connectionHistoryTitle}</h2>
        <div className="history-top-actions">
          <div className="history-search-wrap">
            <span className="history-search-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              className="history-search-input"
              placeholder={messages.profile.historyFilterPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              aria-label={messages.profile.historyFilterAriaLabel}
            />
          </div>
          <div className="history-filter-wrap">
            <button
              type="button"
              className={`history-filter-btn ${statusFilter !== 'all' ? 'filter-active' : ''}`}
              onClick={() => setShowFilterMenu((v) => !v)}
              title={messages.profile.historyFilterByStatus}
              aria-label={messages.profile.historyFilterByStatus}
            >
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M1 2H15M4 6H12M6 10H10" />
              </svg>
              {statusFilter !== 'all' ? (
                <span className="history-filter-dot" />
              ) : null}
            </button>
            {showFilterMenu ? (
              <div className="history-filter-dropdown" role="menu">
                <div className="dropdown-title">
                  {messages.profile.historyFilterMenuTitle}
                </div>
                <button
                  type="button"
                  className={`dropdown-item ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('all');
                    setPage(0);
                    setShowFilterMenu(false);
                  }}
                >
                  <span>{messages.profile.historyAllStatuses}</span>
                  {statusFilter === 'all' ? <b>✓</b> : null}
                </button>
                <button
                  type="button"
                  className={`dropdown-item ${statusFilter === 'success' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('success');
                    setPage(0);
                    setShowFilterMenu(false);
                  }}
                >
                  <span className="history-pill history-pill-success dropdown-pill">
                    {messages.profile.historySuccess}
                  </span>
                  {statusFilter === 'success' ? <b>✓</b> : null}
                </button>
                <button
                  type="button"
                  className={`dropdown-item ${statusFilter === 'warning' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('warning');
                    setPage(0);
                    setShowFilterMenu(false);
                  }}
                >
                  <span className="history-pill history-pill-warning dropdown-pill">
                    {messages.profile.historyMfaReq}
                  </span>
                  {statusFilter === 'warning' ? <b>✓</b> : null}
                </button>
                <button
                  type="button"
                  className={`dropdown-item ${statusFilter === 'danger' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('danger');
                    setPage(0);
                    setShowFilterMenu(false);
                  }}
                >
                  <span className="history-pill history-pill-danger dropdown-pill">
                    {messages.profile.historyFailure}
                  </span>
                  {statusFilter === 'danger' ? <b>✓</b> : null}
                </button>
                <button
                  type="button"
                  className={`dropdown-item ${statusFilter === 'info' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('info');
                    setPage(0);
                    setShowFilterMenu(false);
                  }}
                >
                  <span className="history-pill history-pill-info dropdown-pill">
                    {messages.profile.historyPasswordChanged}
                  </span>
                  {statusFilter === 'info' ? <b>✓</b> : null}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="history-table-container">
        <div className="history-header-row">
          <span>{messages.profile.historyColDate}</span>
          <span>{messages.profile.historyColDevice}</span>
          <span>{messages.profile.historyColBrowser}</span>
          <span>{messages.profile.historyColIp}</span>
          <span>{messages.profile.historyColStatus}</span>
        </div>
        <div
          className="table-change-animate"
          key={`hist-rows-${page}-${statusFilter}-${displaySkeleton ? 'skel' : 'loaded'}`}
        >
          {displaySkeleton ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="history-data-row">
                <div className="history-col-date">
                  <span
                    className="skeleton-box"
                    style={{ width: 140, height: 16 }}
                  />
                </div>
                <div className="history-col-device">
                  <span
                    className="skeleton-box"
                    style={{ width: 120, height: 16 }}
                  />
                </div>
                <div className="history-col-browser">
                  <span
                    className="skeleton-box"
                    style={{ width: 100, height: 16 }}
                  />
                </div>
                <div className="history-col-ip">
                  <span
                    className="skeleton-box"
                    style={{ width: 110, height: 16 }}
                  />
                </div>
                <div className="history-col-status">
                  <span
                    className="skeleton-box"
                    style={{ width: 75, height: 24, borderRadius: 999 }}
                  />
                </div>
              </div>
            ))
          ) : error ? (
            <p className="profile-history-empty">{error}</p>
          ) : paginatedLogs.length === 0 ? (
            <p className="profile-history-empty">
              {messages.profile.historyEmpty}
            </p>
          ) : (
            paginatedLogs.map((log) => (
              <div key={log.id} className="history-data-row">
                <div className="history-col-date">{log.date}</div>
                <div className="history-col-device">{log.device}</div>
                <div className="history-col-browser">{log.browser}</div>
                <div className="history-col-ip">{log.ip}</div>
                <div className="history-col-status">
                  <span className={`history-pill history-pill-${log.variant}`}>
                    {log.statusLabel}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="history-footer">
        <span className="history-footer-info">
          {total === 0
            ? messages.profile.historyNoEntries
            : interpolate(messages.profile.historyShowingEntries, {
                end: endIdx,
                total,
              })}
        </span>
        <div className="history-pagination">
          <button
            type="button"
            className="history-page-btn"
            disabled={currentPage === 0}
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            aria-label={messages.profile.historyPrevPage}
          >
            <svg
              width="6"
              height="10"
              viewBox="0 0 6 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 9L1 5L5 1" />
            </svg>
          </button>
          <button
            type="button"
            className="history-page-btn"
            disabled={currentPage >= maxPage || total === 0}
            onClick={() => setPage(Math.min(maxPage, currentPage + 1))}
            aria-label={messages.profile.historyNextPage}
          >
            <svg
              width="6"
              height="10"
              viewBox="0 0 6 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 9L5 5L1 1" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
