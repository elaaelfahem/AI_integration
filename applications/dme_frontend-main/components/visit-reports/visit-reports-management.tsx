'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import { TableSkeletonRows } from '@/components/shared/table-skeleton';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import { INTL_LOCALES, type Locale } from '@/lib/i18n/config';
import type { VisitReport, VisitReportStatus } from '@/types/auth';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Toast } from '@/components/auth/toast';
import {
  VISIT_REPORT_STATUSES,
  visitReportInterestLabel,
  visitReportNeedLabel,
  visitReportOutcomeLabel,
  visitReportSolutionLabel,
  visitReportStatusLabel,
} from './visit-report-shared';

function formatDate(iso: string, locale: Locale) {
  return new Date(iso).toLocaleDateString(INTL_LOCALES[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function agentName(report: VisitReport) {
  const person = report.meeting.agent?.user;
  return person ? `${person.first_name} ${person.last_name}` : '—';
}

export function VisitReportsManagement({ role }: { role?: string }) {
  const { messages, locale } = useI18n();
  const t = messages.visitReportsPage;
  const canReview = role === 'SUPERADMIN' || role === 'MANAGER';
  const [reports, setReports] = useState<VisitReport[]>([]);
  const [stats, setStats] = useState({
    draft: 0,
    submitted: 0,
    inReview: 0,
    validated: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VisitReportStatus | 'ALL'>(
    'ALL',
  );
  const [selected, setSelected] = useState<VisitReport | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function loadReports() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      const [list, statsResult] = await Promise.all([
        authApi.listVisitReports(query),
        authApi.getVisitReportStats(),
      ]);
      setReports(list);
      setStats(statsResult);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      report.meeting.company.name.toLowerCase().includes(query),
    );
  }, [reports, search]);

  async function handleReview(status: 'IN_REVIEW' | 'VALIDATED') {
    if (!selected) return;
    setReviewing(true);
    try {
      const updated = await authApi.reviewVisitReport(
        selected.meeting.id,
        status,
      );
      setSelected(updated);
      setReports((current) =>
        current.map((report) => (report.id === updated.id ? updated : report)),
      );
      setNotice(t.noticeReviewed);
      void loadReports();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorReviewFailed);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section
      className="users-page"
      id="visit-reports"
      aria-labelledby="visit-reports-title"
    >
      <div className="users-page-header">
        <h1 id="visit-reports-title">
          <strong>{t.titleStrong}</strong>
          {t.titleRest}
        </h1>
      </div>

      {notice ? (
        <Toast
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="users-stat-strip" aria-label={t.titleRest}>
        <div className="users-stat">
          <div>
            <strong>
              {loading ? (
                <span
                  className="skeleton-box"
                  style={{
                    width: '2.5rem',
                    height: '1.7rem',
                    display: 'inline-block',
                  }}
                />
              ) : (
                stats.draft
              )}
            </strong>
            <span>{t.statDraft}</span>
          </div>
          <Image
            src="/file.svg"
            alt=""
            width={22}
            height={22}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>
              {loading ? (
                <span
                  className="skeleton-box"
                  style={{
                    width: '2.5rem',
                    height: '1.7rem',
                    display: 'inline-block',
                  }}
                />
              ) : (
                stats.submitted
              )}
            </strong>
            <span>{t.statSubmitted}</span>
          </div>
          <Image
            src="/tickets/upload-cloud.svg"
            alt=""
            width={26}
            height={26}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>
              {loading ? (
                <span
                  className="skeleton-box"
                  style={{
                    width: '2.5rem',
                    height: '1.7rem',
                    display: 'inline-block',
                  }}
                />
              ) : (
                stats.inReview
              )}
            </strong>
            <span>{t.statInReview}</span>
          </div>
          <Image
            src="/clock.svg"
            alt=""
            width={24}
            height={24}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>
              {loading ? (
                <span
                  className="skeleton-box"
                  style={{
                    width: '2.5rem',
                    height: '1.7rem',
                    display: 'inline-block',
                  }}
                />
              ) : (
                stats.validated
              )}
            </strong>
            <span>{t.statValidated}</span>
          </div>
          <Image
            src="/check.svg"
            alt=""
            width={22}
            height={22}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="users-toolbar agents-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </label>
        <FilterDropdown
          ariaLabel={t.filterStatusAll}
          value={statusFilter}
          onChange={(value) =>
            setStatusFilter(value as VisitReportStatus | 'ALL')
          }
          options={[
            { value: 'ALL', label: t.filterStatusAll },
            ...VISIT_REPORT_STATUSES.map((status) => ({
              value: status,
              label: visitReportStatusLabel(status, t),
            })),
          ]}
        />
      </div>

      <div className={selected ? 'visit-report-split' : undefined}>
        <div className="users-table-wrap visit-report-list-panel">
          <table
            className={`users-table${selected ? ' visit-report-table-compact' : ''}`}
          >
            <thead>
              <tr>
                <th>{t.colCompany}</th>
                <th>{t.colAgent}</th>
                <th>{t.colDate}</th>
                <th>{t.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeletonRows columns={4} />
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={4}>{t.emptyState}</td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr
                    key={report.id}
                    onClick={() => setSelected(report)}
                    className={`visit-report-row${selected?.id === report.id ? ' visit-report-row-active' : ''}`}
                  >
                    <td data-label={t.colCompany}>
                      {report.meeting.company.name}
                    </td>
                    <td data-label={t.colAgent}>{agentName(report)}</td>
                    <td data-label={t.colDate}>
                      {formatDate(report.meeting.scheduled_at, locale)}
                    </td>
                    <td data-label={t.colStatus}>
                      <span
                        className={`b2b-status visit-report-status-pill visit-report-status-${report.status.toLowerCase()}`}
                      >
                        {visitReportStatusLabel(report.status, t)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <aside
            className="visit-report-detail-panel"
            aria-labelledby="visit-report-detail-title"
          >
            <div>
              <span
                id="visit-report-detail-title"
                className="visit-report-detail-eyebrow"
              >
                {t.detailCompanyInfo}
              </span>
              <h3>{selected.meeting.company.name}</h3>
              <dl className="visit-report-detail-facts">
                {selected.meeting.company.sector ? (
                  <div>
                    <dt>{t.detailSector}</dt>
                    <dd>{selected.meeting.company.sector}</dd>
                  </div>
                ) : null}
                {selected.meeting.company.address ? (
                  <div>
                    <dt>{t.detailAddress}</dt>
                    <dd>{selected.meeting.company.address}</dd>
                  </div>
                ) : null}
                {selected.meeting.company.contact_name ? (
                  <div>
                    <dt>{t.detailContact}</dt>
                    <dd>{selected.meeting.company.contact_name}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <hr />
            <div className="visit-report-detail-section">
              <span className="visit-report-detail-eyebrow">
                {t.detailVisitInfo}
              </span>
              <dl className="visit-report-detail-facts">
                <div>
                  <dt>{t.detailDate}</dt>
                  <dd>{formatDate(selected.meeting.scheduled_at, locale)}</dd>
                </div>
                <div>
                  <dt>{t.detailDuration}</dt>
                  <dd>
                    {interpolate(messages.shared.minutes, {
                      count: selected.meeting.duration_minutes,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t.detailAgent}</dt>
                  <dd>{agentName(selected)}</dd>
                </div>
              </dl>
            </div>
            {selected.summary ? (
              <>
                <hr />
                <div className="visit-report-detail-section">
                  <span className="visit-report-detail-eyebrow">
                    {t.detailSummary}
                  </span>
                  <p className="visit-report-detail-summary">
                    {selected.summary}
                  </p>
                </div>
              </>
            ) : null}
            {selected.notes.length > 0 ? (
              <div className="visit-report-detail-section">
                <span className="visit-report-detail-eyebrow">
                  {t.formNotesLabel}
                </span>
                <div className="visit-report-notes-list">
                  {selected.notes.map((note) => {
                    const person = note.author?.user;
                    return (
                      <div className="visit-report-note-item" key={note.id}>
                        <p>{note.body}</p>
                        <div className="visit-report-note-meta">
                          <span>
                            {person
                              ? `${person.first_name} ${person.last_name} · `
                              : ''}
                            {new Date(note.created_at).toLocaleString(
                              INTL_LOCALES[locale],
                              {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selected.needs.length > 0 ? (
              <div className="visit-report-detail-section">
                <span className="visit-report-detail-eyebrow">
                  {t.detailNeeds}
                </span>
                <div className="visit-report-detail-chips">
                  {selected.needs.map((need) => (
                    <span key={need}>{visitReportNeedLabel(need, t)}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {selected.solutions.length > 0 ? (
              <div className="visit-report-detail-section">
                <span className="visit-report-detail-eyebrow">
                  {t.detailSolutions}
                </span>
                <div className="visit-report-detail-chips">
                  {selected.solutions.map((solution) => (
                    <span key={solution}>
                      {visitReportSolutionLabel(solution, t)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {selected.interest_level ? (
              <div className="visit-report-detail-section">
                <span className="visit-report-detail-eyebrow">
                  {t.detailInterest}
                </span>
                <p className="visit-report-detail-summary">
                  {visitReportInterestLabel(selected.interest_level, t)}
                </p>
              </div>
            ) : null}
            {selected.outcome_result ? (
              <div className="visit-report-detail-section">
                <span className="visit-report-detail-eyebrow">
                  {t.colOutcome}
                </span>
                <span className="b2b-status visit-report-outcome-pill">
                  {visitReportOutcomeLabel(selected.outcome_result, t)}
                </span>
              </div>
            ) : null}
            {canReview &&
            (selected.status === 'SUBMITTED' ||
              selected.status === 'IN_REVIEW') ? (
              <>
                <hr />
                <div className="visit-report-detail-actions">
                  {selected.status === 'SUBMITTED' ? (
                    <button
                      className="outline-button"
                      type="button"
                      disabled={reviewing}
                      onClick={() => void handleReview('IN_REVIEW')}
                    >
                      {t.reviewMoveToReview}
                    </button>
                  ) : null}
                  <button
                    className="orange-button"
                    type="button"
                    disabled={reviewing}
                    onClick={() => void handleReview('VALIDATED')}
                  >
                    {t.reviewValidate}
                  </button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              className="outline-button ticket-detail-close"
              onClick={() => setSelected(null)}
            >
              {t.formCancel}
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
