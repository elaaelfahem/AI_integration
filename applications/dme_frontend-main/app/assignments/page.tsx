'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/workspace/app-shell';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError, authApi } from '@/lib/api';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { CompanyCombobox } from '@/components/shared/company-combobox';
import { Combobox } from '@/components/shared/combobox';
import {
  DatePickerField,
  TimePickerField,
} from '@/components/shared/date-time-picker';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate, type Messages } from '@/lib/i18n/messages';
import type {
  Assignment,
  AssignmentStatus,
  Company,
  ProspectionReport,
} from '@/types/auth';

type Agent = {
  id: string;
  account: { id: string };
  first_name: string;
  last_name: string;
  email: string;
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  manager_id?: string | null;
};

export default function AssignmentsPage() {
  const { messages } = useI18n();
  const t = messages.assignmentsPage;
  const { account } = useAuth();
  const searchParams = useSearchParams();
  const prefillCompanyId = searchParams.get('companyId') ?? undefined;
  const [items, setItems] = useState<Assignment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [managers, setManagers] = useState<
    Array<{ id: string; firstName: string; lastName: string }>
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Assignment | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reportAssignment, setReportAssignment] = useState<Assignment | null>(
    null,
  );
  const canManage =
    account?.role === 'SUPERADMIN' || account?.role === 'MANAGER';
  const isAgent = account?.role === 'AGENT';

  useEffect(() => {
    if (!prefillCompanyId || !canManage) return;
    queueMicrotask(() => setDrawerOpen(true));
  }, [prefillCompanyId, canManage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, g] = await Promise.all([
        authApi.listAssignments(),
        authApi.listCompanies(),
        canManage ? authApi.listAgents() : Promise.resolve([]),
      ]);
      setItems(a);
      setCompanies(c);
      setAgents(g);
      if (account?.role === 'SUPERADMIN') {
        const users = await authApi.listUsers();
        setManagers(
          users
            .filter((u) => u.role === 'MANAGER')
            .map((u) => ({
              id: u.accountId ?? u.id,
              firstName: u.firstName,
              lastName: u.lastName,
            })),
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.errorLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [account, canManage, t.errorLoadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!openActionId) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest('.row-menu-panel') &&
        !target?.closest('.row-menu-trigger')
      ) {
        setOpenActionId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionId]);

  async function update(id: string, status: AssignmentStatus) {
    setError('');
    try {
      await authApi.updateAssignment(id, { status });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.errorUpdateFailed);
    }
  }

  async function removeAssignment(item: Assignment) {
    setWorkingId(item.id);
    setError('');
    try {
      await authApi.deleteAssignment(item.id);
      setNotice(t.noticeDeleted);
      setDialog(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.errorDeleteFailed);
    } finally {
      setWorkingId(null);
    }
  }

  function confirmDelete(item: Assignment) {
    setOpenActionId(null);
    setDialog({
      title: t.dialogDeleteTitle,
      message: interpolate(t.dialogDeleteMessage, {
        company: item.company.name,
      }),
      actionLabel: t.dialogDeleteAction,
      tone: 'danger',
      onConfirm: () => removeAssignment(item),
    });
  }

  const statusOptions = [
    { value: 'ALL', label: t.statusAll },
    { value: 'ASSIGNED', label: t.statusAssigned },
    { value: 'IN_PROGRESS', label: t.statusInProgress },
    { value: 'COMPLETED', label: t.statusCompleted },
    { value: 'CANCELLED', label: t.statusCancelled },
  ];

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!query || item.company.name.toLowerCase().includes(query)) &&
        (statusFilter === 'ALL' || item.status === statusFilter),
    );
  }, [items, search, statusFilter]);

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
          {canManage ? (
            <div className="users-page-actions">
              <button
                className="orange-button"
                type="button"
                onClick={() => setDrawerOpen(true)}
              >
                <span aria-hidden="true">+</span> {t.newAssignment}
              </button>
            </div>
          ) : null}
        </header>
        <div className="users-stat-strip">
          <AssignmentStat
            value={items.length}
            label={t.statTotal}
            color="blue"
            skeleton={loading}
          />
          <AssignmentStat
            value={
              items.filter(
                (item) =>
                  item.status === 'ASSIGNED' || item.status === 'PENDING',
              ).length
            }
            label={t.statUpcoming}
            color="purple"
            skeleton={loading}
          />
          <AssignmentStat
            value={items.filter((item) => item.status === 'IN_PROGRESS').length}
            label={t.statInProgress}
            color="green"
            skeleton={loading}
          />
          <AssignmentStat
            value={items.filter((item) => item.status === 'COMPLETED').length}
            label={t.statCompleted}
            color="red"
            skeleton={loading}
          />
        </div>
        {notice ? (
          <p className="profile-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="users-toolbar">
          <label className="users-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchAriaLabel}
            />
          </label>
          <FilterDropdown
            ariaLabel={t.statusFilterAriaLabel}
            value={statusFilter}
            options={statusOptions}
            onChange={setStatusFilter}
          />
        </div>
        <section
          className="users-table-section table-change-animate"
          key={`${loading}-${statusFilter}-${visibleItems.length}`}
        >
          <div className="users-table-wrap">
            <table className="users-table assignments-table">
              <thead>
                <tr>
                  <th>{t.colCompany}</th>
                  <th>{t.colAgent}</th>
                  <th>{t.colDate}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="table-change-animate">
                {loading ? (
                  <AssignmentsSkeleton />
                ) : (
                  visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td data-label={t.colCompany}>
                        <strong
                          className="cell-truncate"
                          title={item.company.name}
                        >
                          {item.company.name}
                        </strong>
                      </td>
                      <td
                        data-label={t.colAgent}
                        title={
                          item.agent?.user
                            ? `${item.agent.user.first_name} ${item.agent.user.last_name}`
                            : undefined
                        }
                      >
                        {item.agent?.user
                          ? `${item.agent.user.first_name} ${item.agent.user.last_name}`
                          : '—'}
                      </td>
                      <td data-label={t.colDate}>
                        {new Date(item.scheduled_at).toLocaleString()}
                      </td>
                      <td data-label={t.colStatus}>
                        <span
                          className={`b2b-status b2b-status-${item.status.toLowerCase()}`}
                        >
                          {statusLabel(item.status, t)}
                        </span>
                      </td>
                      <td data-label={t.colActions}>
                        {(() => {
                          const isActive =
                            item.status !== 'CANCELLED' &&
                            item.status !== 'COMPLETED';
                          if (
                            !canManage &&
                            !(isAgent && isActive) &&
                            !item.prospection?.report
                          )
                            return '—';
                          return (
                            <div className="row-menu">
                              <button
                                className="row-menu-trigger"
                                type="button"
                                aria-expanded={openActionId === item.id}
                                onClick={() =>
                                  setOpenActionId(
                                    openActionId === item.id ? null : item.id,
                                  )
                                }
                              >
                                <span aria-hidden="true">
                                  <i />
                                  <i />
                                  <i />
                                </span>
                              </button>
                              {openActionId === item.id ? (
                                <div className="row-menu-panel">
                                  {isAgent && isActive ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        void update(
                                          item.id,
                                          item.status === 'IN_PROGRESS'
                                            ? 'COMPLETED'
                                            : 'IN_PROGRESS',
                                        );
                                      }}
                                    >
                                      {item.status === 'IN_PROGRESS'
                                        ? t.actionComplete
                                        : t.actionStart}
                                    </button>
                                  ) : null}
                                  {canManage ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        setEditingItem(item);
                                      }}
                                    >
                                      {t.actionEdit}
                                    </button>
                                  ) : null}
                                  {canManage && isActive ? (
                                    <button
                                      type="button"
                                      className="danger-action"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        void update(item.id, 'CANCELLED');
                                      }}
                                    >
                                      {t.actionCancel}
                                    </button>
                                  ) : null}
                                  {isActive || item.prospection?.report ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        setReportAssignment(item);
                                      }}
                                    >
                                      {messages.fieldReport.open}
                                    </button>
                                  ) : null}
                                  {canManage ? (
                                    <button
                                      type="button"
                                      className="danger-action"
                                      onClick={() => confirmDelete(item)}
                                    >
                                      {t.actionDelete}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && !visibleItems.length ? (
            <div className="users-empty">{t.emptyState}</div>
          ) : null}
        </section>
        {drawerOpen ? (
          <AssignmentDrawer
            accountRole={account?.role}
            managers={managers}
            companies={companies}
            agents={agents}
            assignments={items}
            initialCompanyId={prefillCompanyId}
            onClose={() => setDrawerOpen(false)}
            onSubmit={async (input) => {
              await authApi.createAssignment({
                companyId: input.companyId,
                agentId: input.agentId,
                ...(input.managerId && { managerId: input.managerId }),
                scheduledAt: new Date(input.date).toISOString(),
                durationMinutes: 60,
                visitType: 'FIRST_VISIT',
                priority: 'MEDIUM',
              });
              await load();
            }}
          />
        ) : null}
        {editingItem ? (
          <AssignmentDrawer
            mode="edit"
            accountRole={account?.role}
            managers={managers}
            companies={companies}
            agents={agents}
            assignments={items}
            initialCompanyId={editingItem.company.id}
            initialManagerId={editingItem.manager_id}
            initialAgentId={editingItem.agent_id}
            initialDate={toLocalDatetimeInputValue(editingItem.scheduled_at)}
            onClose={() => setEditingItem(null)}
            onSubmit={async (input) => {
              await authApi.updateAssignment(editingItem.id, {
                companyId: input.companyId,
                agentId: input.agentId,
                scheduledAt: new Date(input.date).toISOString(),
              });
              await load();
            }}
          />
        ) : null}
        {reportAssignment ? (
          <FieldReportDrawer
            assignment={reportAssignment}
            onClose={() => setReportAssignment(null)}
            onSaved={load}
          />
        ) : null}
        {dialog ? (
          <ConfirmDialog
            dialog={dialog}
            isWorking={Boolean(workingId)}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </main>
    </AppShell>
  );
}

function toLocalDatetimeInputValue(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FieldReportDrawer({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: Assignment;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const r = useI18n().messages.fieldReport;
  const [report, setReport] = useState<ProspectionReport | null>(null);
  const [summary, setSummary] = useState('');
  const [needs, setNeeds] = useState('');
  const [outcome, setOutcome] = useState('');
  const [objections, setObjections] = useState('');
  const [suggestedOffer, setSuggestedOffer] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let active = true;
    void authApi
      .getProspectionReport(assignment.id)
      .then((value) => {
        if (!active) return;
        setReport(value);
        setSummary(value.summary);
        setNeeds(value.needs);
        setOutcome(value.outcome);
        setObjections(value.objections ?? '');
        setSuggestedOffer(value.suggested_offer ?? '');
        setNextAction(value.next_action ?? '');
        setFollowUpAt(
          value.follow_up_at
            ? toLocalDatetimeInputValue(value.follow_up_at)
            : '',
        );
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 404) return;
        if (active)
          setError(reason instanceof ApiError ? reason.message : r.loadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignment.id, r.loadError]);

  function close() {
    if (saving || exporting || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary.trim() || !needs.trim() || !outcome.trim()) {
      setError(r.requiredError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await authApi.submitProspectionReport(assignment.id, {
        summary: summary.trim(),
        needs: needs.trim(),
        outcome: outcome.trim(),
        ...(objections.trim() && { objections: objections.trim() }),
        ...(suggestedOffer.trim() && {
          suggestedOffer: suggestedOffer.trim(),
        }),
        ...(nextAction.trim() && { nextAction: nextAction.trim() }),
        ...(followUpAt && {
          followUpAt: new Date(followUpAt).toISOString(),
        }),
      });
      setReport(saved);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : r.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function exportReport() {
    setExporting(true);
    setError('');
    try {
      const { blob, filename } = await authApi.exportProspectionReport(
        assignment.id,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : r.exportError);
    } finally {
      setExporting(false);
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
        className={`user-drawer report-drawer${closing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-report-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          disabled={saving || exporting}
          aria-label={r.close}
        >
          ×
        </button>
        <h2 id="field-report-drawer-title">{r.title}</h2>
        <p>{assignment.company.name}</p>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="report-drawer-loading" aria-busy="true">
            <span className="skeleton-box" />
            <span className="skeleton-box" />
            <span className="skeleton-box" />
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="drawer-field">
              <span>
                {r.summary} <b>*</b>
              </span>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={4}
                maxLength={10000}
                disabled={saving}
                required
              />
            </label>
            <label className="drawer-field">
              <span>
                {r.needs} <b>*</b>
              </span>
              <textarea
                value={needs}
                onChange={(event) => setNeeds(event.target.value)}
                rows={3}
                maxLength={5000}
                disabled={saving}
                required
              />
            </label>
            <label className="drawer-field">
              <span>
                {r.outcome} <b>*</b>
              </span>
              <textarea
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                rows={3}
                maxLength={3000}
                disabled={saving}
                required
              />
            </label>
            <label className="drawer-field">
              <span>{r.objections}</span>
              <textarea
                value={objections}
                onChange={(event) => setObjections(event.target.value)}
                rows={2}
                maxLength={5000}
                disabled={saving}
              />
            </label>
            <label className="drawer-field">
              <span>{r.suggestedOffer}</span>
              <textarea
                value={suggestedOffer}
                onChange={(event) => setSuggestedOffer(event.target.value)}
                rows={2}
                maxLength={5000}
                disabled={saving}
              />
            </label>
            <label className="drawer-field">
              <span>{r.nextAction}</span>
              <input
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                maxLength={1000}
                disabled={saving}
              />
            </label>
            <label className="drawer-field">
              <span>{r.followUp}</span>
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
                disabled={saving}
              />
            </label>
            {report?.processing ? (
              <div className="report-processing-result" role="status">
                <strong>
                  {r.verdictLabel}{' '}
                  {report.processing.verdict
                    ? r.verdict[report.processing.verdict]
                    : r.verdictPending}
                </strong>
                {report.processing.reasons ? (
                  <p>{report.processing.reasons}</p>
                ) : null}
              </div>
            ) : null}
            <div className="drawer-actions">
              <button
                className="outline-button"
                type="button"
                onClick={close}
                disabled={saving || exporting}
              >
                {r.cancel}
              </button>
              {report ? (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => void exportReport()}
                  disabled={saving || exporting}
                >
                  {exporting ? r.exporting : r.exportPdf}
                </button>
              ) : null}
              <button
                className="orange-button"
                type="submit"
                disabled={saving || exporting}
              >
                {saving ? r.saving : r.save}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}

function statusLabel(status: AssignmentStatus, t: Messages['assignmentsPage']) {
  switch (status) {
    case 'ASSIGNED':
      return t.statusAssigned;
    case 'IN_PROGRESS':
      return t.statusInProgress;
    case 'COMPLETED':
      return t.statusCompleted;
    case 'CANCELLED':
      return t.statusCancelled;
    default:
      return status;
  }
}

function AssignmentsSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((row) => (
        <tr key={row} aria-hidden="true">
          <td>
            <span
              className="skeleton-box"
              style={{ width: '10rem', height: 16 }}
            />
          </td>
          <td>
            <span
              className="skeleton-box"
              style={{ width: '7rem', height: 14 }}
            />
          </td>
          <td>
            <span
              className="skeleton-box"
              style={{ width: '9rem', height: 14 }}
            />
          </td>
          <td>
            <span
              className="skeleton-box"
              style={{ width: '6rem', height: 24, borderRadius: 999 }}
            />
          </td>
          <td>
            <span
              className="skeleton-box"
              style={{ width: '5rem', height: 26 }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

function AssignmentStat({
  value,
  label,
  color,
  skeleton,
}: {
  value: number;
  label: string;
  color: string;
  skeleton: boolean;
}) {
  return (
    <div className="users-stat">
      <div>
        <strong>
          {skeleton ? (
            <span
              className="skeleton-box"
              style={{
                width: '2.5rem',
                height: '1.7rem',
                display: 'inline-block',
              }}
            />
          ) : (
            value
          )}
        </strong>
        <span>{label}</span>
      </div>
      <span className={`users-stat-icon users-stat-icon-${color}`}>
        <Image
          src="/assign.svg"
          alt=""
          width={22}
          height={22}
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

function AssignmentDrawer({
  mode = 'create',
  accountRole,
  managers,
  companies,
  agents,
  assignments,
  initialCompanyId,
  initialManagerId,
  initialAgentId,
  initialDate,
  onClose,
  onSubmit,
}: {
  mode?: 'create' | 'edit';
  accountRole?: string;
  managers: Array<{ id: string; firstName: string; lastName: string }>;
  companies: Company[];
  agents: Agent[];
  assignments: Assignment[];
  initialCompanyId?: string;
  initialManagerId?: string;
  initialAgentId?: string;
  initialDate?: string;
  onClose: () => void;
  onSubmit: (input: {
    managerId?: string;
    companyId: string;
    agentId: string;
    date: string;
  }) => Promise<void>;
}) {
  const { messages } = useI18n();
  const t = messages.assignmentsPage;
  const isEdit = mode === 'edit';
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [managerId, setManagerId] = useState(initialManagerId ?? '');
  const [agentId, setAgentId] = useState(initialAgentId ?? '');
  const initialParsed = initialDate ? new Date(initialDate) : null;
  const initialHour24 = initialParsed?.getHours() ?? null;
  const [visitDate, setVisitDate] = useState<Date | null>(initialParsed);
  const [visitTime, setVisitTime] = useState<{
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  } | null>(
    initialParsed && initialHour24 !== null
      ? {
          hour: initialHour24 % 12 === 0 ? 12 : initialHour24 % 12,
          minute: initialParsed.getMinutes(),
          period: initialHour24 >= 12 ? 'PM' : 'AM',
        }
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);

  const availableAgents = agents.filter(
    (agent) => !managerId || agent.manager_id === managerId,
  );
  const selectedAgent = agents.find((agent) => agent.account.id === agentId);

  function close() {
    if (saving || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!visitDate || !visitTime) {
      setError(t.createError);
      return;
    }
    setSaving(true);
    try {
      const scheduled = new Date(visitDate);
      const hour24 =
        visitTime.period === 'PM'
          ? visitTime.hour === 12
            ? 12
            : visitTime.hour + 12
          : visitTime.hour === 12
            ? 0
            : visitTime.hour;
      scheduled.setHours(hour24, visitTime.minute, 0, 0);
      await onSubmit({
        managerId: managerId || undefined,
        companyId,
        agentId,
        date: scheduled.toISOString(),
      });
      close();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t.createError);
    } finally {
      setSaving(false);
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
        aria-labelledby="assignment-drawer-title"
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
        <h2 id="assignment-drawer-title">
          {isEdit ? t.editDrawerTitle : t.drawerTitle}
        </h2>
        <p>{isEdit ? t.editDrawerSubtitle : t.drawerSubtitle}</p>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        <hr />
        <form onSubmit={submit}>
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
          {!isEdit && accountRole === 'SUPERADMIN' ? (
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
              disabled={saving || (accountRole === 'SUPERADMIN' && !managerId)}
              required
            />
            {accountRole === 'SUPERADMIN' &&
            managerId &&
            !availableAgents.length ? (
              <span className="drawer-field-hint">{t.noActiveAgentsHint}</span>
            ) : null}
          </label>
          {selectedAgent ? (
            <AgentWorkloadCard
              agent={selectedAgent}
              assignments={assignments}
            />
          ) : null}
          <label className="drawer-field">
            <span>
              {t.fieldDate} <b>*</b>
            </span>
            <div className="drawer-datetime-row">
              <DatePickerField
                value={visitDate}
                onChange={setVisitDate}
                min={isEdit ? undefined : new Date()}
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

function AgentWorkloadCard({
  agent,
  assignments,
}: {
  agent: Agent;
  assignments: Assignment[];
}) {
  const { messages } = useI18n();
  const t = messages.assignmentsPage;
  const agentAssignments = assignments.filter(
    (assignment) => assignment.agent_id === agent.account.id,
  );

  const today = new Date();
  const todayKey = today.toDateString();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const visitsToday = agentAssignments.filter(
    (assignment) =>
      new Date(assignment.scheduled_at).toDateString() === todayKey,
  ).length;
  const visitsThisWeek = agentAssignments.filter(
    (assignment) => new Date(assignment.scheduled_at) >= startOfWeek,
  ).length;
  const pendingReports = agentAssignments.filter(
    (assignment) =>
      assignment.status === 'IN_PROGRESS' && !assignment.prospection?.report,
  ).length;
  const isAvailable = visitsToday < 3;

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
          <strong className="workload-stat-warning">{visitsToday}</strong>
        </div>
        <div>
          <small>{t.workloadVisitsWeek}</small>
          <strong>{visitsThisWeek}</strong>
        </div>
        <div>
          <small>{t.workloadPendingReports}</small>
          <strong className="workload-stat-danger">{pendingReports}</strong>
        </div>
        <div>
          <small>{t.workloadAvailability}</small>
          <strong className="workload-stat-success">
            {isAvailable ? t.workloadAvailable : t.workloadBusy}
          </strong>
        </div>
      </div>
    </div>
  );
}
