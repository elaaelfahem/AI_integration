'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/workspace/app-shell';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError, authApi } from '@/lib/api';
import { StatusPill } from '@/components/user-management/status-pill';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Pagination } from '@/components/shared/pagination';
import { CompanyCombobox } from '@/components/shared/company-combobox';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import type { Company, ManagedUser, Manager } from '@/types/auth';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

type Agent = ManagedUser & { role: 'AGENT'; accountId: string };

export default function AgentsPage() {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  const { account } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignmentAgent, setAssignmentAgent] = useState<Agent | null>(null);
  const [invitations, setInvitations] = useState<Manager[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, pendingInvitations, availableCompanies] =
        await Promise.all([
          authApi.listAgents(),
          authApi.listManagers(),
          authApi.listCompanies(),
        ]);
      setInvitations(
        pendingInvitations.filter((invitation) => invitation.role === 'AGENT'),
      );
      setCompanies(availableCompanies);
      setAgents(
        response.map((agent) => ({
          id: agent.id,
          accountId: agent.account.id,
          email: agent.email,
          firstName: agent.first_name,
          lastName: agent.last_name,
          phone: agent.phone ?? null,
          role: 'AGENT',
          status: agent.status ?? 'ACTIVE',
          latestLogin: null,
          createdAt: '',
          passwordResetRequired: false,
          managerName: null,
        })),
      );
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t.errorLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.errorLoadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest('.row-menu'))
        setOpenActionId(null);
    }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const visibleAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      const matchesSearch =
        !query ||
        `${agent.firstName} ${agent.lastName} ${agent.email}`
          .toLowerCase()
          .includes(query);
      return matchesSearch && (status === 'ALL' || agent.status === status);
    });
  }, [agents, search, status]);
  const pageCount = Math.max(1, Math.ceil(visibleAgents.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const paginatedAgents = visibleAgents.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const statusOptions = [
    { value: 'ALL', label: t.statusAll },
    { value: 'ACTIVE', label: t.statusActive },
    { value: 'PENDING', label: t.statusPending },
    { value: 'BLOCKED', label: t.statusBlocked },
  ];

  async function runAction(
    id: string,
    action: () => Promise<unknown>,
    message: string,
  ) {
    setWorkingId(id);
    setError('');
    try {
      await action();
      setNotice(message);
      setDialog(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : t.errorActionFailed,
      );
    } finally {
      setWorkingId(null);
    }
  }

  function confirmAction(agent: Agent, action: 'block' | 'unblock' | 'delete') {
    const isBlock = action === 'block';
    const isDelete = action === 'delete';
    setOpenActionId(null);
    setDialog({
      title: isDelete
        ? t.dialogDeleteTitle
        : isBlock
          ? t.dialogBlockTitle
          : t.dialogUnblockTitle,
      message: isDelete
        ? interpolate(t.dialogDeleteMessage, { email: agent.email })
        : interpolate(t.dialogConfirmActionMessage, {
            name: `${agent.firstName} ${agent.lastName}`,
          }),
      actionLabel: isDelete
        ? t.dialogDeleteAction
        : isBlock
          ? t.dialogBlockAction
          : t.dialogUnblockAction,
      tone: isBlock || isDelete ? 'danger' : 'default',
      variant: isDelete ? 'delete' : isBlock ? 'block' : 'unblock',
      email: agent.email,
      user: {
        firstName: agent.firstName,
        lastName: agent.lastName,
        role: 'AGENT',
      },
      onConfirm: () =>
        runAction(
          agent.id,
          isDelete
            ? () => authApi.deleteUser(agent.id)
            : isBlock
              ? () => authApi.blockUser(agent.id)
              : () => authApi.unblockUser(agent.id),
          isDelete
            ? t.noticeDeleted
            : isBlock
              ? t.noticeBlocked
              : t.noticeUnblocked,
        ),
    });
  }

  function confirmInvitation(invitation: Manager, action: 'resend' | 'cancel') {
    setOpenActionId(null);
    const isCancel = action === 'cancel';
    setDialog({
      title: isCancel
        ? t.dialogInvitationCancelTitle
        : t.dialogInvitationResendTitle,
      message: `${invitation.email} — ${invitation.firstName} ${invitation.lastName}`,
      actionLabel: isCancel
        ? t.dialogInvitationCancelAction
        : t.dialogInvitationResendAction,
      tone: isCancel ? 'danger' : 'default',
      variant: isCancel ? 'cancel-invitation' : undefined,
      onConfirm: () =>
        runAction(
          invitation.id,
          isCancel
            ? () => authApi.cancelManagerInvitation(invitation.id)
            : () => authApi.resendManagerInvitation(invitation.id),
          isCancel ? t.noticeInvitationCancelled : t.noticeInvitationResent,
        ),
    });
  }

  if (account && account.role !== 'MANAGER')
    return (
      <AppShell>
        <main className="workspace-page">
          <section className="b2b-card">
            <h1>{t.unauthorizedTitle}</h1>
            <p>{t.unauthorizedMessage}</p>
          </section>
        </main>
      </AppShell>
    );

  return (
    <AppShell>
      <section
        className="users-page"
        id="agents"
        aria-labelledby="agents-title"
      >
        <div className="users-page-header">
          <div>
            <h1 id="agents-title">
              <strong>{t.titleStrong}</strong>
              {t.titleRest}
            </h1>
            <p className="users-page-subtitle">{t.subtitle}</p>
          </div>
          <div className="users-page-actions">
            <button
              className="orange-button"
              type="button"
              onClick={() => setDrawerOpen(true)}
            >
              <span aria-hidden="true">+</span> {t.addAgent}
            </button>
          </div>
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
        <div className="users-stat-strip" aria-label={t.summaryAriaLabel}>
          <AgentStat
            value={agents.length}
            label={t.statTotal}
            color="blue"
            icon="/users.svg"
            skeleton={loading}
          />
          <AgentStat
            value={agents.filter((agent) => agent.status === 'ACTIVE').length}
            label={t.statActive}
            color="green"
            icon="/users.svg"
            skeleton={loading}
          />
          <AgentStat
            value={agents.filter((agent) => agent.status === 'PENDING').length}
            label={t.statPending}
            color="purple"
            icon="/shield.svg"
            skeleton={loading}
          />
          <AgentStat
            value={agents.filter((agent) => agent.status === 'BLOCKED').length}
            label={t.statBlocked}
            color="red"
            icon="/shield.svg"
            skeleton={loading}
          />
        </div>
        <div className="users-toolbar">
          <label className="users-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchAriaLabel}
            />
          </label>
          <FilterDropdown
            ariaLabel={t.statusFilterAriaLabel}
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </div>
        <div className="users-tabs" role="tablist" aria-label={t.tabsAriaLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => {
              setActiveTab('users');
              setStatus('ALL');
            }}
          >
            {t.tabAgents} <span>{agents.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'invitations'}
            onClick={() => {
              setActiveTab('invitations');
              setStatus('ALL');
            }}
          >
            {t.tabInvitations} <span>{loading ? '…' : invitations.length}</span>
          </button>
        </div>
        <div
          className="table-animate-wrapper table-change-animate"
          key={`${loading}-${activeTab}-${status}-${currentPage}`}
        >
          {loading ? (
            <AgentsTableSkeleton />
          ) : activeTab === 'users' ? (
            <AgentsTable
              agents={paginatedAgents}
              openActionId={openActionId}
              setOpenActionId={setOpenActionId}
              workingId={workingId}
              onAction={confirmAction}
              onAssign={setAssignmentAgent}
              currentPage={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              pageSize={perPage}
              onPageSizeChange={(size) => {
                setPerPage(size);
                setPage(1);
              }}
            />
          ) : (
            <InvitationsTable
              invitations={invitations}
              openActionId={openActionId}
              setOpenActionId={setOpenActionId}
              workingId={workingId}
              onAction={confirmInvitation}
            />
          )}
        </div>
        {drawerOpen ? (
          <AgentDrawer
            onClose={() => setDrawerOpen(false)}
            onSubmit={async (input) => {
              await authApi.inviteManager({ ...input, role: 'AGENT' });
              setNotice(t.noticeInviteSent);
              await load();
            }}
          />
        ) : null}
        {dialog ? (
          <ConfirmDialog
            dialog={dialog}
            isWorking={Boolean(workingId)}
            onClose={() => setDialog(null)}
          />
        ) : null}
        {assignmentAgent ? (
          <AgentAssignmentDrawer
            agent={assignmentAgent}
            companies={companies}
            onClose={() => setAssignmentAgent(null)}
            onSubmit={async (companyId, date) => {
              await authApi.createAssignment({
                companyId,
                agentId: assignmentAgent.accountId,
                scheduledAt: new Date(date).toISOString(),
                durationMinutes: 60,
                visitType: 'FIRST_VISIT',
                priority: 'MEDIUM',
              });
              setNotice(t.noticeCompanyAssigned);
              await load();
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function AgentStat({
  value,
  label,
  color,
  icon,
  skeleton,
}: {
  value: number;
  label: string;
  color: string;
  icon: string;
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
        <Image src={icon} alt="" width={22} height={22} aria-hidden="true" />
      </span>
    </div>
  );
}

function AgentsTable({
  agents,
  openActionId,
  setOpenActionId,
  workingId,
  onAction,
  onAssign,
  currentPage,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  agents: Agent[];
  openActionId: string | null;
  setOpenActionId: (id: string | null) => void;
  workingId: string | null;
  onAction: (agent: Agent, action: 'block' | 'unblock' | 'delete') => void;
  onAssign: (agent: Agent) => void;
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}) {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  if (!agents.length) return <div className="users-empty">{t.emptyAgents}</div>;
  return (
    <div className="users-table-section">
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>{t.colProfile}</th>
              <th>{t.colEmail}</th>
              <th>{t.colRole}</th>
              <th>{t.colStatus}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody
            className="table-change-animate"
            key={`${currentPage}-${agents.map((agent) => agent.id).join(',')}`}
          >
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td data-label={t.colProfile}>
                  <div className="cell-profile">
                    <span className="user-avatar">
                      {agent.firstName.charAt(0)}
                      {agent.lastName.charAt(0)}
                    </span>
                    <span
                      className="cell-truncate"
                      title={`${agent.firstName} ${agent.lastName}`}
                    >
                      {agent.firstName} {agent.lastName}
                    </span>
                  </div>
                </td>
                <td data-label={t.colEmail} title={agent.email}>
                  {agent.email}
                </td>
                <td data-label={t.colRole}>
                  <StatusPill value="AGENT" />
                </td>
                <td data-label={t.colStatus}>
                  <StatusPill value={agent.status} />
                </td>
                <td data-label={t.colActions}>
                  <div className="row-menu">
                    <button
                      className="row-menu-trigger"
                      type="button"
                      aria-expanded={openActionId === agent.id}
                      onClick={() =>
                        setOpenActionId(
                          openActionId === agent.id ? null : agent.id,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                    {openActionId === agent.id ? (
                      <div className="row-menu-panel">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenActionId(null);
                            onAssign(agent);
                          }}
                          disabled={Boolean(workingId)}
                        >
                          {t.actionAssignCompany}
                        </button>
                        <button type="button" disabled={Boolean(workingId)}>
                          {t.actionEdit}
                        </button>
                        {agent.status === 'BLOCKED' ? (
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => onAction(agent, 'unblock')}
                          >
                            {t.actionReactivate}
                          </button>
                        ) : agent.status === 'ACTIVE' ? (
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => onAction(agent, 'block')}
                          >
                            {t.actionBlock}
                          </button>
                        ) : null}
                        <button
                          className="danger-action"
                          type="button"
                          onClick={() => onAction(agent, 'delete')}
                        >
                          {t.actionDelete}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        ariaLabel={messages.pagination.ariaLabel}
        prevLabel={messages.pagination.prev}
        nextLabel={messages.pagination.next}
        rowsPerPageLabel={messages.pagination.rowsPerPage}
      />
    </div>
  );
}

function AgentsTableSkeleton() {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  return (
    <div className="users-table-section">
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>{t.colProfile}</th>
              <th>{t.colEmail}</th>
              <th>{t.colRole}</th>
              <th>{t.colStatus}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((row) => (
              <tr key={row}>
                <td>
                  <span
                    className="skeleton-circle"
                    style={{
                      width: 40,
                      height: 40,
                      display: 'inline-block',
                      marginRight: 10,
                    }}
                  />
                  <span
                    className="skeleton-box"
                    style={{ width: 140, height: 16, display: 'inline-block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: 200, height: 16 }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: 80, height: 26, borderRadius: 999 }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: 80, height: 26, borderRadius: 999 }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: 30, height: 28 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitationsTable({
  invitations,
  openActionId,
  setOpenActionId,
  workingId,
  onAction,
}: {
  invitations: Manager[];
  openActionId: string | null;
  setOpenActionId: (id: string | null) => void;
  workingId: string | null;
  onAction: (invitation: Manager, action: 'resend' | 'cancel') => void;
}) {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  if (!invitations.length)
    return <div className="users-empty">{t.emptyInvitations}</div>;
  return (
    <div className="users-table-section">
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>{t.colProfile}</th>
              <th>{t.colEmail}</th>
              <th>{t.colRole}</th>
              <th>{t.colStatus}</th>
              <th>{t.colActions}</th>
            </tr>
          </thead>
          <tbody
            className="table-change-animate"
            key={invitations
              .map(
                (invitation) =>
                  `${invitation.id}-${invitation.invitationStatus}`,
              )
              .join(',')}
          >
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td data-label={t.colProfile}>
                  <div className="cell-profile">
                    <span className="user-avatar">
                      {invitation.firstName.charAt(0)}
                      {invitation.lastName.charAt(0)}
                    </span>
                    <span
                      className="cell-truncate"
                      title={`${invitation.firstName} ${invitation.lastName}`}
                    >
                      {invitation.firstName} {invitation.lastName}
                    </span>
                  </div>
                </td>
                <td data-label={t.colEmail} title={invitation.email}>
                  {invitation.email}
                </td>
                <td data-label={t.colRole}>
                  <StatusPill value="AGENT" />
                </td>
                <td data-label={t.colStatus}>
                  <StatusPill value={invitation.invitationStatus} />
                </td>
                <td data-label={t.colActions}>
                  <div className="row-menu">
                    <button
                      className="row-menu-trigger"
                      type="button"
                      aria-expanded={openActionId === invitation.id}
                      onClick={() =>
                        setOpenActionId(
                          openActionId === invitation.id ? null : invitation.id,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                    {openActionId === invitation.id ? (
                      <div className="row-menu-panel">
                        <button
                          type="button"
                          onClick={() => onAction(invitation, 'resend')}
                          disabled={Boolean(workingId)}
                        >
                          {t.actionResend}
                        </button>
                        <button
                          type="button"
                          className="danger-action"
                          onClick={() => onAction(invitation, 'cancel')}
                          disabled={Boolean(workingId)}
                        >
                          {t.actionCancel}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentAssignmentDrawer({
  agent,
  companies,
  onClose,
  onSubmit,
}: {
  agent: Agent;
  companies: Company[];
  onClose: () => void;
  onSubmit: (companyId: string, date: string) => Promise<void>;
}) {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  const [companyId, setCompanyId] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  function close() {
    if (saving || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(companyId, date);
      close();
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : t.assignDrawerError,
      );
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
        aria-labelledby="agent-assignment-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          disabled={saving}
          aria-label={t.assignDrawerCancel}
        >
          ×
        </button>
        <h2 id="agent-assignment-title">{t.assignDrawerTitle}</h2>
        <p>
          {t.assignDrawerSelectedAgent}{' '}
          <strong>
            {agent.firstName} {agent.lastName}
          </strong>
        </p>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        <hr />
        <form onSubmit={submit}>
          <label className="drawer-field">
            <span>
              {t.assignDrawerFieldCompany} <b>*</b>
            </span>
            <CompanyCombobox
              companies={companies}
              value={companyId}
              onChange={setCompanyId}
              placeholder={t.assignDrawerFieldCompanyPlaceholder}
              disabled={saving}
              required
            />
          </label>
          <label className="drawer-field">
            <span>
              {t.assignDrawerFieldDate} <b>*</b>
            </span>
            <input
              required
              type="datetime-local"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={saving}
            />
          </label>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={close}
              disabled={saving}
            >
              {t.assignDrawerCancel}
            </button>
            <button className="orange-button" type="submit" disabled={saving}>
              {saving ? t.assignDrawerSubmitting : t.assignDrawerSubmit}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function AgentDrawer({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<void>;
}) {
  const { messages } = useI18n();
  const t = messages.agentsPage;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [requestError, setRequestError] = useState('');
  function handleClose() {
    if (saving || isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, 350);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError('');
    setSaving(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      handleClose();
    } catch (reason) {
      setRequestError(
        reason instanceof ApiError ? reason.message : t.inviteDrawerError,
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className={`drawer-backdrop${isClosing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <aside
        className={`user-drawer${isClosing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={handleClose}
          disabled={saving}
          aria-label={t.inviteDrawerCancel}
        >
          ×
        </button>
        <h2 id="agent-drawer-title">{t.inviteDrawerTitle}</h2>
        <p>{t.inviteDrawerSubtitle}</p>
        {requestError ? (
          <p className="users-error" role="alert">
            {requestError}
          </p>
        ) : null}
        <hr />
        <form onSubmit={submit}>
          <label className="drawer-field">
            <span>
              {t.inviteDrawerFieldName} <b>*</b>
            </span>
            <div className="drawer-name-fields">
              <input
                required
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setRequestError('');
                }}
                placeholder={t.inviteDrawerFirstNamePlaceholder}
                disabled={saving}
              />
              <input
                required
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  setRequestError('');
                }}
                placeholder={t.inviteDrawerLastNamePlaceholder}
                disabled={saving}
              />
            </div>
          </label>
          <label className="drawer-field">
            <span>{t.inviteDrawerFieldPhone}</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.inviteDrawerPhonePlaceholder}
              disabled={saving}
            />
          </label>
          <label className="drawer-field">
            <span>
              {t.inviteDrawerFieldEmail} <b>*</b>
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setRequestError('');
              }}
              placeholder={t.inviteDrawerEmailPlaceholder}
              disabled={saving}
            />
          </label>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={handleClose}
              disabled={saving}
            >
              {t.inviteDrawerCancel}
            </button>
            <button className="orange-button" type="submit" disabled={saving}>
              {saving ? t.inviteDrawerSubmitting : t.inviteDrawerSubmit}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
