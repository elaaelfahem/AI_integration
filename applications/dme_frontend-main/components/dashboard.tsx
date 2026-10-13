'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/workspace/app-shell';
import { useAuth } from './auth/auth-provider';
import { CriteriaDialog } from '@/components/prospection/criteria-dialog';
import { authApi } from '@/lib/api';
import { DEBUG_SKELETON } from '@/lib/skeleton';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import { INTL_LOCALES } from '@/lib/i18n/config';
import type { DashboardSnapshot } from '@/types/auth';

function BuildingIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v8h4" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11h-4" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="#ff7900"
      stroke="#ff7900"
      strokeWidth="0.8"
      aria-hidden="true"
    >
      <path d="m12 2 2.2 6.8a1.5 1.5 0 0 0 1 1L22 12l-6.8 2.2a1.5 1.5 0 0 0-1 1L12 22l-2.2-6.8a1.5 1.5 0 0 0-1-1L2 12l6.8-2.2a1.5 1.5 0 0 0 1-1L12 2z" />
      <circle cx="19" cy="5" r="1.5" fill="#ff7900" />
    </svg>
  );
}

function StatSparkleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    </svg>
  );
}

function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CalendarHeaderIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="1.5" fill="#ff7900" />
      <line
        x1="8"
        y1="2"
        x2="8"
        y2="5"
        stroke="#ff7900"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="2"
        x2="16"
        y2="5"
        stroke="#ff7900"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line x1="4" y1="9" x2="20" y2="9" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="10" y1="9" x2="10" y2="21" stroke="#ffffff" strokeWidth="1" />
      <line x1="15" y1="9" x2="15" y2="21" stroke="#ffffff" strokeWidth="1" />
      <line x1="4" y1="13" x2="20" y2="13" stroke="#ffffff" strokeWidth="1" />
      <line x1="4" y1="17" x2="20" y2="17" stroke="#ffffff" strokeWidth="1" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function WarningTriangleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill="#ff7900"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13.5"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1.1" fill="#ffffff" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ff7900"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SingleUserIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function WorkloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function AvailableUserIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  );
}

type DashboardRole = 'SUPERADMIN' | 'MANAGER' | 'AGENT';

const TEAM_ICONS = {
  orange: SingleUserIcon,
  blue: TeamIcon,
  red: WorkloadIcon,
  yellow: AvailableUserIcon,
} as const;

const VISIT_PILL_CLASS = {
  CONFIRMED: 'status-confirmed',
  PENDING: 'status-pending',
  TO_CONFIRM: 'status-to-confirm',
} as const;

function StatSkeleton({ width }: { width: string }) {
  return (
    <span
      className="skeleton-box"
      style={{ width, height: '1.8rem', display: 'inline-block' }}
    />
  );
}

export function Dashboard() {
  const { account } = useAuth();
  const { messages, locale } = useI18n();
  const t = messages.dashboardPage;
  const router = useRouter();

  const viewRole: DashboardRole =
    account?.role === 'MANAGER'
      ? 'MANAGER'
      : account?.role === 'AGENT'
        ? 'AGENT'
        : 'SUPERADMIN';

  const [isLoading, setIsLoading] = useState(true);
  const showSkeleton = isLoading || DEBUG_SKELETON;
  const [prospectionOpen, setProspectionOpen] = useState(false);
  const [prospectingBusy, setProspectingBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      setIsLoading(true);
      setLoadError('');
      try {
        const result = await authApi.getDashboard();
        if (!isCancelled) setSnapshot(result);
      } catch {
        if (!isCancelled) {
          setSnapshot(null);
          setLoadError(t.loadError);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [viewRole, t.loadError]);

  const intlLocale = INTL_LOCALES[locale];
  const formatCount = (value: number) =>
    new Intl.NumberFormat(intlLocale).format(value);

  function formatVisitDate(value: string) {
    const date = new Date(value);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const day =
      date.toDateString() === today.toDateString()
        ? t.today
        : date.toDateString() === tomorrow.toDateString()
          ? t.tomorrow
          : new Intl.DateTimeFormat(intlLocale, { dateStyle: 'long' }).format(
              date,
            );
    const time = new Intl.DateTimeFormat(intlLocale, {
      timeStyle: 'short',
    }).format(date);
    return `${day}, ${time}`;
  }

  const stats = [
    {
      value: snapshot?.stats.totalCompanies ?? 0,
      label: t.statTotalCompanies[viewRole],
      badge: 'badge-blue',
      icon: <BuildingIcon />,
      skeleton: '3.5rem',
    },
    {
      value: snapshot?.stats.aiProspects ?? 0,
      label: t.statAiProspects[viewRole],
      badge: 'badge-orange',
      icon: <StatSparkleIcon />,
      skeleton: '3rem',
    },
    {
      value: snapshot?.stats.upcomingVisits ?? 0,
      label: t.statUpcomingVisits[viewRole],
      badge: 'badge-green',
      icon: <CalendarIcon size={18} />,
      skeleton: '2.5rem',
    },
    {
      value: snapshot?.stats.openTickets ?? 0,
      label: t.statOpenTickets[viewRole],
      badge: 'badge-red',
      icon: <AlertCircleIcon />,
      skeleton: '2.5rem',
    },
  ];

  const priorities = snapshot?.priorities ?? [];
  const visits = snapshot?.visits ?? [];
  const teamItems = snapshot?.team.items ?? [];

  return (
    <AppShell>
      <section
        className="dashboard-page users-page"
        id="dashboard"
        aria-labelledby="dashboard-title"
        aria-busy={showSkeleton}
      >
        <div className="dashboard-header users-page-header">
          <div>
            <h1 id="dashboard-title">
              <strong>{t.titleStrong}</strong>
              {t.titleRest}
            </h1>
          </div>
        </div>

        {loadError ? (
          <p className="users-error" role="alert">
            {loadError}
          </p>
        ) : null}

        <div className="dashboard-stats-card" aria-label={t.statsAriaLabel}>
          {stats.map((stat) => (
            <div key={stat.label} className="dashboard-stat-col">
              <div className="dashboard-stat-info">
                <span className="dashboard-stat-number">
                  {showSkeleton ? (
                    <StatSkeleton width={stat.skeleton} />
                  ) : (
                    formatCount(stat.value)
                  )}
                </span>
                <span className="dashboard-stat-label">{stat.label}</span>
              </div>
              <div
                className={`dashboard-stat-icon-badge ${stat.badge}`}
                aria-hidden="true"
              >
                {stat.icon}
              </div>
            </div>
          ))}
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-col-left">
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <span className="panel-header-icon" aria-hidden="true">
                  <WarningTriangleIcon />
                </span>
                <h2>{t.prioritiesTitle}</h2>
              </div>

              <div className="dashboard-priority-list">
                {showSkeleton ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="dashboard-priority-item"
                      aria-hidden="true"
                    >
                      <div className="priority-item-left" style={{ flex: 1 }}>
                        <span
                          className="skeleton-box"
                          style={{
                            width: 82,
                            height: 26,
                            borderRadius: 12,
                            flexShrink: 0,
                          }}
                        />
                        <div className="priority-item-text" style={{ flex: 1 }}>
                          <span
                            className="skeleton-box"
                            style={{
                              width:
                                index === 0 ? 160 : index === 1 ? 200 : 175,
                              height: 14,
                              marginBottom: 4,
                              display: 'block',
                            }}
                          />
                          <span
                            className="skeleton-box"
                            style={{
                              width:
                                index === 0 ? 280 : index === 1 ? 240 : 260,
                              height: 12,
                              display: 'block',
                            }}
                          />
                        </div>
                      </div>
                      <div className="priority-item-action">
                        <span
                          className="skeleton-box"
                          style={{
                            width: 44,
                            height: 24,
                            borderRadius: 0,
                            display: 'inline-block',
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : priorities.length === 0 ? (
                  <p className="dashboard-empty-text">{t.prioritiesEmpty}</p>
                ) : (
                  priorities.map((item) => {
                    const copy = t.priorities[item.id];
                    return (
                      <div key={item.id} className="dashboard-priority-item">
                        <div className="priority-item-left">
                          <span
                            className={`priority-badge badge-${item.badgeType}`}
                          >
                            {copy.badge}
                          </span>
                          <div className="priority-item-text">
                            <span className="priority-item-title">
                              {interpolate(
                                item.count === 1 ? copy.one : copy.other,
                                { count: formatCount(item.count) },
                              )}
                            </span>
                            <span className="priority-item-subtitle">
                              {copy.subtitle}
                            </span>
                          </div>
                        </div>
                        <div className="priority-item-action">
                          <Link href={item.href} className="priority-see-btn">
                            {t.seeAction}
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <span className="panel-header-icon" aria-hidden="true">
                  <CalendarHeaderIcon />
                </span>
                <h2>{t.upcomingVisitsTitle}</h2>
              </div>

              <div className="dashboard-visits-table-wrap">
                <table className="dashboard-visits-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.colCompany}</th>
                      <th scope="col">{t.colAgent}</th>
                      <th scope="col">{t.colDate}</th>
                      <th scope="col">{t.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showSkeleton ? (
                      Array.from({ length: 3 }, (_, index) => (
                        <tr key={index} aria-hidden="true">
                          {[
                            index === 0 ? 140 : index === 1 ? 120 : 130,
                            index === 0 ? 100 : index === 1 ? 115 : 95,
                            index === 0 ? 80 : index === 1 ? 70 : 85,
                          ].map((width, cell) => (
                            <td
                              key={cell}
                              className={
                                cell === 0 ? 'company-name' : undefined
                              }
                            >
                              <span
                                className="skeleton-box"
                                style={{ width, height: 16, display: 'block' }}
                              />
                            </td>
                          ))}
                          <td>
                            <span
                              className="skeleton-box"
                              style={{
                                width: 78,
                                height: 22,
                                borderRadius: 9999,
                                display: 'inline-block',
                              }}
                            />
                          </td>
                        </tr>
                      ))
                    ) : visits.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="dashboard-empty-cell">
                          {t.upcomingVisitsEmpty}
                        </td>
                      </tr>
                    ) : (
                      visits.map((visit, index) => (
                        <tr key={index}>
                          <td className="company-name">{visit.company}</td>
                          <td>{visit.agent}</td>
                          <td>{formatVisitDate(visit.date)}</td>
                          <td>
                            <span
                              className={`visit-status-pill ${VISIT_PILL_CLASS[visit.status]}`}
                            >
                              {t.visitStatus[visit.status]}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="dashboard-panel-footer">
                <Link href="/meetings" className="dashboard-see-calendar-btn">
                  {t.seeCalendar}
                </Link>
              </div>
            </div>
          </div>

          <div className="dashboard-col-right">
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <span className="panel-header-icon" aria-hidden="true">
                  <TeamIcon />
                </span>
                <h2>{t.teamTitle[viewRole]}</h2>
              </div>

              <div className="dashboard-team-list">
                {showSkeleton
                  ? Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="dashboard-team-row"
                        aria-hidden="true"
                      >
                        <div className="team-row-left">
                          <span
                            className="skeleton-box"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            className="skeleton-box"
                            style={{
                              width:
                                index === 0 ? 140 : index === 1 ? 160 : 150,
                              height: 16,
                              marginLeft: 10,
                              display: 'inline-block',
                            }}
                          />
                        </div>
                        <div className="team-row-right">
                          <span
                            className="skeleton-box"
                            style={{
                              width: 24,
                              height: 18,
                              display: 'inline-block',
                            }}
                          />
                        </div>
                      </div>
                    ))
                  : teamItems.map((member) => {
                      const IconComponent = TEAM_ICONS[member.icon];
                      return (
                        <div key={member.key} className="dashboard-team-row">
                          <div className="team-row-left">
                            <div
                              className={`team-icon-box icon-${member.icon}`}
                              aria-hidden="true"
                            >
                              <IconComponent />
                            </div>
                            <span className="team-row-label">
                              {t.teamItems[member.key]}
                            </span>
                          </div>
                          <div className="team-row-right">
                            <span className="team-row-val">
                              {formatCount(Number(member.value))}
                            </span>
                            {member.note ? (
                              <span className="team-row-sub">
                                {t.teamAvailableNote}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>

            <div className="dashboard-panel dashboard-prospection-panel">
              <div className="dashboard-panel-header">
                <span className="panel-header-icon" aria-hidden="true">
                  <SparkleIcon />
                </span>
                <h2>{t.launchProspectionTitle}</h2>
              </div>

              <div className="dashboard-prospection-body">
                <Image
                  src="/prospection-frame.svg"
                  alt={t.prospectionIllustrationAlt}
                  width={140}
                  height={115}
                  className="dashboard-prospection-illustration"
                  priority
                />
                <button
                  type="button"
                  className="dashboard-launch-btn"
                  disabled={account?.role === 'AGENT' || prospectingBusy}
                  onClick={() => setProspectionOpen(true)}
                >
                  {prospectingBusy ? 'Prospection…' : t.launchProspection}
                </button>
              </div>
            </div>
          </div>
        </div>

        {prospectionOpen ? (
          <CriteriaDialog
            onClose={() => setProspectionOpen(false)}
            onSubmit={async (criteria) => {
              setProspectionOpen(false);
              setProspectingBusy(true);
              try {
                await authApi.startProspecting(criteria);
                router.push('/prospection');
              } catch (reason) {
                setLoadError(
                  reason instanceof Error
                    ? reason.message
                    : t.prospectionLaunchError,
                );
              } finally {
                setProspectingBusy(false);
              }
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

export function BrandMark() {
  return (
    <Image
      className="brand-logo"
      src="/logo-orange-b2b.png"
      alt="Orange B2B"
      width={3276}
      height={800}
      priority
    />
  );
}
