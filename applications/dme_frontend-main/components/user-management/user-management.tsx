'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import type { ManagedUser, Manager } from '@/types/auth';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { StatusPill } from '@/components/user-management/status-pill';
import { EditUserDrawer } from '@/components/user-management/edit-user-drawer';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Pagination } from '@/components/shared/pagination';
import { DrawerField } from '@/components/shared/drawer-field';
import { Toast } from '@/components/auth/toast';
import { DEBUG_SKELETON } from '@/lib/skeleton';
import {
  isEmailDomainAllowed,
  getEmailDomainWhitelistErrorMessage,
} from '@/lib/validation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

type AccessTab = 'users' | 'invitations';
type DrawerRole = 'MANAGER' | 'AGENT';

export function UserManagement() {
  const { messages } = useI18n();
  const [activeTab, setActiveTab] = useState<AccessTab>('users');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invitations, setInvitations] = useState<Manager[]>([]);
  const [superadminCount, setSuperadminCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const showSkeleton = isLoading || DEBUG_SKELETON;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const passwordResetTarget = useRef<ManagedUser | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openActionId) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest('.row-menu-panel') &&
        !target?.closest('.row-menu-trigger')
      ) {
        setOpenActionId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openActionId]);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen]);

  async function handleExport(format: 'csv' | 'xlsx') {
    setIsExportMenuOpen(false);
    setError(null);
    setIsExporting(true);
    try {
      const { blob, filename } = await authApi.exportUsers(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(
        getAccessError(reason, messages.userManagement.errorExportFailed),
      );
    } finally {
      setIsExporting(false);
    }
  }

  const refreshAccessManagement = useCallback(async () => {
    try {
      const [activeUsers, pendingInvitations, summary] = await Promise.all([
        authApi.listUsers(),
        authApi.listManagers(),
        authApi.getUserManagementSummary(),
      ]);
      setUsers(
        activeUsers.map((user) =>
          user.passwordResetRequired
            ? { ...user, status: 'RESET' as const }
            : user,
        ),
      );
      setInvitations(
        pendingInvitations.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      setSuperadminCount(summary.superadmins);
    } catch (reason) {
      setError(
        getAccessError(reason, messages.userManagement.noticeUsersUnavailable),
      );
    }
  }, [messages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAccessManagement().finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAccessManagement]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !query ||
        `${user.firstName} ${user.lastName} ${user.email}`
          .toLowerCase()
          .includes(query);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const userStatus = user.status;
      const matchesStatus =
        statusFilter === 'ALL' || userStatus === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const visibleInvitations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invitations.filter((manager) => {
      const matchesQuery =
        !query ||
        `${manager.firstName} ${manager.lastName} ${manager.email}`
          .toLowerCase()
          .includes(query);
      const matchesRole = roleFilter === 'ALL' || manager.role === roleFilter;
      const matchesStatus =
        statusFilter === 'ALL' || manager.invitationStatus === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [invitations, search, roleFilter, statusFilter]);

  const userPageCount = Math.max(
    1,
    Math.ceil(visibleUsers.length / usersPerPage),
  );
  const currentUserPage = Math.min(userPage, userPageCount);
  const paginatedUsers = useMemo(
    () =>
      visibleUsers.slice(
        (currentUserPage - 1) * usersPerPage,
        currentUserPage * usersPerPage,
      ),
    [visibleUsers, currentUserPage, usersPerPage],
  );

  const stats = [
    {
      value: users.length + invitations.length,
      label: messages.userManagement.statTotal,
      color: 'blue',
      icon: '/users.svg',
    },
    {
      value: superadminCount,
      label: messages.userManagement.statAdmins,
      color: 'purple',
      icon: '/admins.svg',
    },
    {
      value:
        users.filter((user) => user.role === 'MANAGER').length +
        invitations.filter((invitation) => invitation.role === 'MANAGER')
          .length,
      label: messages.userManagement.statManagers,
      color: 'green',
      icon: '/users.svg',
    },
    {
      value:
        users.filter((user) => user.role === 'AGENT').length +
        invitations.filter((invitation) => invitation.role === 'AGENT').length,
      label: messages.userManagement.statAgents,
      color: 'red',
      icon: '/shield.svg',
    },
  ];

  function openDialog(nextDialog: ConfirmDialogState) {
    setOpenActionId(null);
    setDialog(nextDialog);
  }

  async function runConfirmedAction(
    id: string,
    action: () => Promise<void>,
    successMessage: string,
    fallbackMessage: string,
    nextDialog?: ConfirmDialogState,
  ) {
    setError(null);
    setNotice(null);
    setWorkingId(id);
    const isPasswordReset = passwordResetTarget.current?.id === id;
    try {
      await action();
      if (isPasswordReset) {
        const target = passwordResetTarget.current;
        if (target)
          setDialog({
            title: '',
            message: '',
            actionLabel: messages.userManagement.drawerClose,
            variant: 'password-reset',
            email: target.email,
            onConfirm: () => Promise.resolve(),
          });
        passwordResetTarget.current = null;
      }
      await refreshAccessManagement();
      setNotice(successMessage);
      if (!isPasswordReset && dialog?.variant === 'password-reset-request') {
        setDialog({
          title: messages.userManagement.dialogResetSentTitle,
          message: '',
          actionLabel: messages.userManagement.drawerClose,
          variant: 'password-reset',
          email: dialog.email,
          onConfirm: () => Promise.resolve(),
        });
      } else if (!isPasswordReset) {
        setDialog(nextDialog ?? null);
      }
    } catch (reason) {
      setError(getAccessError(reason, fallbackMessage));
    } finally {
      setWorkingId(null);
    }
  }

  function confirmBlock(user: ManagedUser) {
    const name = `${user.firstName} ${user.lastName}`;
    openDialog({
      title: messages.userManagement.dialogBlockTitle,
      message: interpolate(messages.userManagement.dialogBlockMessage, {
        name,
      }),
      actionLabel: messages.userManagement.dialogBlockAction,
      tone: 'danger',
      variant: 'block',
      onConfirm: () =>
        runConfirmedAction(
          user.id,
          () => authApi.blockUser(user.id).then(() => undefined),
          interpolate(messages.userManagement.noticeBlocked, {
            email: user.email,
          }),
          messages.userManagement.errorBlockFailed,
        ),
    });
  }

  function confirmUnblock(user: ManagedUser) {
    const name = `${user.firstName} ${user.lastName}`;
    openDialog({
      title: messages.userManagement.dialogUnblockTitle,
      message: interpolate(messages.userManagement.dialogUnblockMessage, {
        name,
      }),
      actionLabel: messages.userManagement.dialogUnblockAction,
      variant: 'unblock',
      onConfirm: () =>
        runConfirmedAction(
          user.id,
          () => authApi.unblockUser(user.id).then(() => undefined),
          interpolate(messages.userManagement.noticeUnblocked, {
            email: user.email,
          }),
          messages.userManagement.errorUnblockFailed,
        ),
    });
  }

  function confirmDelete(user: ManagedUser) {
    openDialog({
      title: messages.userManagement.dialogDeleteTitle,
      message: '',
      actionLabel: messages.userManagement.dialogDeleteAction,
      variant: 'delete',
      email: user.email,
      user,
      onConfirm: () =>
        runConfirmedAction(
          user.id,
          () => authApi.deleteUser(user.id).then(() => undefined),
          interpolate(messages.userManagement.noticeDeleted, {
            email: user.email,
          }),
          messages.userManagement.errorDeleteFailed,
        ),
    });
  }

  function confirmPasswordReset(user: ManagedUser) {
    if (
      user.status === 'BLOCKED' ||
      (user.status !== 'ACTIVE' && user.status !== 'RESET')
    )
      return;
    const isResetState = user.status === 'RESET' || user.passwordResetRequired;
    if (isResetState) {
      openDialog({
        title: messages.userManagement.dialogResendResetTitle,
        message: interpolate(messages.userManagement.dialogResendResetMessage, {
          email: user.email,
        }),
        actionLabel: messages.userManagement.dialogResendResetAction,
        onConfirm: () =>
          runConfirmedAction(
            user.id,
            () =>
              authApi.requireUserPasswordReset(user.id).then(() => undefined),
            interpolate(messages.userManagement.noticeResendResetSent, {
              email: user.email,
            }),
            messages.userManagement.errorResendResetFailed,
          ),
      });
      return;
    }
    passwordResetTarget.current = user;
    openDialog({
      title: messages.userManagement.dialogResetTitle,
      message: interpolate(messages.userManagement.dialogResetMessage, {
        email: user.email,
      }),
      actionLabel: messages.userManagement.dialogResetAction,
      variant: 'password-reset-request',
      email: user.email,
      user,
      onConfirm: () =>
        runConfirmedAction(
          user.id,
          () => authApi.requireUserPasswordReset(user.id).then(() => undefined),
          interpolate(messages.userManagement.noticeInstructionsSent, {
            email: user.email,
          }),
          messages.userManagement.errorResetScheduleFailed,
        ),
    });
  }

  function confirmResend(manager: Manager) {
    openDialog({
      title: messages.userManagement.dialogResendInviteTitle,
      message: interpolate(messages.userManagement.dialogResendInviteMessage, {
        email: manager.email,
      }),
      actionLabel: messages.userManagement.dialogResendInviteAction,
      onConfirm: () =>
        runConfirmedAction(
          manager.id,
          () =>
            authApi.resendManagerInvitation(manager.id).then(() => undefined),
          interpolate(messages.userManagement.noticeInviteResent, {
            email: manager.email,
          }),
          messages.userManagement.errorResendInviteFailed,
        ),
    });
  }

  function confirmCancel(manager: Manager) {
    openDialog({
      title: messages.userManagement.dialogCancelInviteTitle,
      message: interpolate(messages.userManagement.dialogCancelInviteMessage, {
        email: manager.email,
      }),
      actionLabel: messages.userManagement.dialogCancelInviteAction,
      tone: 'danger',
      variant: 'cancel-invitation',
      onConfirm: () =>
        runConfirmedAction(
          manager.id,
          () =>
            authApi.cancelManagerInvitation(manager.id).then(() => undefined),
          interpolate(messages.userManagement.noticeInviteCancelled, {
            email: manager.email,
          }),
          messages.userManagement.errorCancelInviteFailed,
        ),
    });
  }

  return (
    <section className="users-page" id="users" aria-labelledby="users-title">
      <div className="users-page-header">
        <h1 id="users-title">
          <strong>{messages.userManagement.titleStrong}</strong>
          {messages.userManagement.titleRest}
        </h1>
        <div className="users-page-actions">
          <div className="export-menu" ref={exportMenuRef}>
            <button
              className="outline-button export-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              disabled={isExporting}
              onClick={() => setIsExportMenuOpen((current) => !current)}
            >
              {isExporting
                ? messages.userManagement.exporting
                : messages.userManagement.export}{' '}
              <Image
                src="/down_arrow.svg"
                alt=""
                width={14}
                height={7}
                aria-hidden="true"
              />
            </button>
            {isExportMenuOpen ? (
              <div className="row-menu-panel export-menu-panel" role="menu">
                <button type="button" onClick={() => void handleExport('csv')}>
                  {messages.userManagement.exportCsv}
                </button>
                <button type="button" onClick={() => void handleExport('xlsx')}>
                  {messages.userManagement.exportExcel}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="orange-button"
            type="button"
            onClick={() => {
              setError(null);
              setDrawerOpen(true);
            }}
          >
            <span aria-hidden="true">+</span>{' '}
            {messages.userManagement.inviteUser}
          </button>
        </div>
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

      <div
        className="users-stat-strip"
        aria-label={messages.userManagement.summaryAriaLabel}
      >
        {stats.map((stat) => (
          <div className="users-stat" key={stat.label}>
            <div>
              <strong>
                {showSkeleton ? (
                  <span
                    className="skeleton-box"
                    style={{
                      width: '2.5rem',
                      height: '1.7rem',
                      display: 'inline-block',
                    }}
                  />
                ) : (
                  stat.value
                )}
              </strong>
              <span>{stat.label}</span>
            </div>
            <span className={`users-stat-icon users-stat-icon-${stat.color}`}>
              <Image
                src={stat.icon}
                alt=""
                width={22}
                height={22}
                aria-hidden="true"
              />
            </span>
          </div>
        ))}
      </div>

      <div className="users-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setUserPage(1);
            }}
            placeholder={messages.userManagement.searchPlaceholder}
            aria-label={messages.userManagement.searchAriaLabel}
          />
        </label>
        <FilterDropdown
          ariaLabel={messages.userManagement.roleFilterAriaLabel}
          value={roleFilter}
          onChange={(value) => {
            setRoleFilter(value);
            setUserPage(1);
          }}
          options={[
            { value: 'ALL', label: messages.userManagement.allRoles },
            { value: 'MANAGER', label: messages.userManagement.roleManager },
            { value: 'AGENT', label: messages.userManagement.roleAgent },
            { value: 'ADMIN', label: messages.userManagement.roleAdmin },
          ]}
        />
        <FilterDropdown
          ariaLabel={messages.userManagement.statusFilterAriaLabel}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setUserPage(1);
          }}
          options={
            activeTab === 'users'
              ? [
                  { value: 'ALL', label: messages.userManagement.allStatuses },
                  {
                    value: 'ACTIVE',
                    label: messages.userManagement.statusActive,
                  },
                  {
                    value: 'BLOCKED',
                    label: messages.userManagement.statusBlocked,
                  },
                  {
                    value: 'PENDING',
                    label: messages.userManagement.statusPending,
                  },
                  {
                    value: 'RESET',
                    label: messages.userManagement.statusReset,
                  },
                ]
              : [
                  { value: 'ALL', label: messages.userManagement.allStatuses },
                  { value: 'INVITED', label: messages.statusPill.invited },
                  {
                    value: 'PENDING',
                    label: messages.userManagement.statusPending,
                  },
                  { value: 'EXPIRED', label: messages.statusPill.expired },
                  { value: 'CANCELLED', label: messages.statusPill.cancelled },
                ]
          }
        />
      </div>

      <div
        className="users-tabs"
        role="tablist"
        aria-label={messages.userManagement.tabsAriaLabel}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => {
            setActiveTab('users');
            setStatusFilter('ALL');
          }}
        >
          {messages.userManagement.tabUsers}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invitations'}
          onClick={() => {
            setActiveTab('invitations');
            setStatusFilter('ALL');
          }}
        >
          {messages.userManagement.tabInvitations}{' '}
          <span>
            {showSkeleton ? (
              <i
                className="skeleton-box"
                style={{
                  width: 16,
                  height: 14,
                  display: 'inline-block',
                  borderRadius: 4,
                }}
              />
            ) : (
              invitations.length
            )}
          </span>
        </button>
      </div>

      <div
        className="table-animate-wrapper table-change-animate"
        key={activeTab}
      >
        {showSkeleton ? (
          <UsersTableSkeleton />
        ) : activeTab === 'users' ? (
          <UsersTable
            users={paginatedUsers}
            workingId={workingId}
            openActionId={openActionId}
            onOpenAction={setOpenActionId}
            onBlock={confirmBlock}
            onUnblock={confirmUnblock}
            onPasswordReset={confirmPasswordReset}
            onDelete={confirmDelete}
            onEdit={(user) => {
              setError(null);
              setEditingUser(user);
            }}
            currentPage={currentUserPage}
            pageCount={userPageCount}
            onPageChange={setUserPage}
            pageSize={usersPerPage}
            onPageSizeChange={(size) => {
              setUsersPerPage(size);
              setUserPage(1);
            }}
          />
        ) : (
          <InvitationsTable
            invitations={visibleInvitations}
            workingId={workingId}
            openActionId={openActionId}
            onOpenAction={setOpenActionId}
            onResend={confirmResend}
            onCancel={confirmCancel}
          />
        )}
      </div>

      {drawerOpen ? (
        <AddUserDrawer
          managers={users.filter(
            (item) => item.role === 'MANAGER' && item.status === 'ACTIVE',
          )}
          onClose={() => setDrawerOpen(false)}
          onSubmit={async (input) => {
            try {
              await authApi.inviteManager({
                email: input.email,
                role: input.role,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone,
                mfaEnabled: input.mfaEnabled,
                managerId: input.managerId,
              });
              await refreshAccessManagement();
              setActiveTab('invitations');
              setNotice(
                interpolate(messages.userManagement.noticeInviteSent, {
                  email: input.email,
                }),
              );
            } catch (reason) {
              setError(
                getAccessError(
                  reason,
                  messages.userManagement.errorInviteSendFailed,
                ),
              );
            }
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

      {editingUser ? (
        <EditUserDrawer
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={async (input) => {
            try {
              await authApi.updateUser(editingUser.id, input);
              await refreshAccessManagement();
              setNotice(
                interpolate(messages.userManagement.noticeUserUpdated, {
                  name: `${input.firstName} ${input.lastName}`,
                }),
              );
            } catch (reason) {
              setError(
                getAccessError(
                  reason,
                  messages.userManagement.errorUpdateUserFailed,
                ),
              );
              throw reason;
            }
          }}
        />
      ) : null}
    </section>
  );
}

function UsersTableSkeleton() {
  const { messages } = useI18n();
  return (
    <div className="users-table-section">
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>{messages.userManagement.colProfile}</th>
              <th>{messages.userManagement.colEmail}</th>
              <th>{messages.userManagement.colRole}</th>
              <th>{messages.userManagement.colStatus}</th>
              <th>{messages.userManagement.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, index) => (
              <tr key={index}>
                <td data-label={messages.userManagement.colProfile}>
                  <span
                    className="user-avatar skeleton-circle"
                    style={{ width: 40, height: 40, background: 'transparent' }}
                  >
                    <span
                      className="skeleton-circle"
                      style={{ width: 40, height: 40 }}
                    />
                  </span>
                  <span
                    className="skeleton-box"
                    style={{
                      width: index % 2 === 0 ? 150 : 180,
                      height: 16,
                      marginLeft: 10,
                    }}
                  />
                </td>
                <td data-label={messages.userManagement.colEmail}>
                  <span
                    className="skeleton-box"
                    style={{ width: index % 2 === 0 ? 200 : 230, height: 16 }}
                  />
                </td>
                <td data-label={messages.userManagement.colRole}>
                  <span
                    className="skeleton-box"
                    style={{ width: 85, height: 26, borderRadius: 999 }}
                  />
                </td>
                <td data-label={messages.userManagement.colStatus}>
                  <span
                    className="skeleton-box"
                    style={{ width: 75, height: 26, borderRadius: 999 }}
                  />
                </td>
                <td data-label={messages.userManagement.colActions}>
                  <div className="row-menu">
                    <button
                      className="row-menu-trigger"
                      type="button"
                      disabled
                      aria-label={messages.userManagement.actionsUnavailable}
                    >
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="users-pagination">
        <span>{messages.userManagement.showingPage1Of1}</span>
        <div>
          <button
            type="button"
            disabled
            aria-label={messages.userManagement.prevPage}
          >
            ‹
          </button>
          <button
            type="button"
            disabled
            aria-current="page"
            className="page-btn active"
          >
            1
          </button>
          <button
            type="button"
            disabled
            aria-label={messages.userManagement.nextPage}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTable({
  users,
  workingId,
  openActionId,
  onOpenAction,
  onBlock,
  onUnblock,
  onPasswordReset,
  onDelete,
  onEdit,
  currentPage,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  users: ManagedUser[];
  workingId: string | null;
  openActionId: string | null;
  onOpenAction: (id: string | null) => void;
  onBlock: (user: ManagedUser) => void;
  onUnblock: (user: ManagedUser) => void;
  onPasswordReset: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
  onEdit: (user: ManagedUser) => void;
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}) {
  const router = useRouter();
  const { messages } = useI18n();
  if (!users.length)
    return (
      <div className="users-empty">{messages.userManagement.emptyUsers}</div>
    );
  return (
    <div className="users-table-section">
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>{messages.userManagement.colProfile}</th>
              <th>{messages.userManagement.colEmail}</th>
              <th>{messages.userManagement.colRole}</th>
              <th>{messages.userManagement.colStatus}</th>
              <th>{messages.userManagement.colActions}</th>
            </tr>
          </thead>
          <tbody
            className="table-change-animate"
            key={`tbl-page-${currentPage}`}
          >
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label={messages.userManagement.colProfile}>
                  <div className="cell-profile">
                    <span className="user-avatar">
                      {user.firstName.charAt(0)}
                      {user.lastName.charAt(0)}
                    </span>
                    <span
                      className="cell-truncate"
                      title={`${user.firstName} ${user.lastName}`}
                    >
                      {user.firstName} {user.lastName}
                    </span>
                  </div>
                </td>
                <td
                  data-label={messages.userManagement.colEmail}
                  title={user.email}
                >
                  {user.email}
                </td>
                <td data-label={messages.userManagement.colRole}>
                  <StatusPill value={user.role} />
                </td>
                <td data-label={messages.userManagement.colStatus}>
                  <StatusPill value={user.status} />
                </td>
                <td data-label={messages.userManagement.colActions}>
                  <div className="row-menu">
                    <button
                      className="row-menu-trigger"
                      type="button"
                      aria-label={interpolate(
                        messages.userManagement.actionsFor,
                        { name: `${user.firstName} ${user.lastName}` },
                      )}
                      aria-expanded={openActionId === user.id}
                      onClick={() =>
                        onOpenAction(openActionId === user.id ? null : user.id)
                      }
                    >
                      <span aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                    {openActionId === user.id ? (
                      <div className="row-menu-panel">
                        <button
                          type="button"
                          onClick={() => router.push(`/users/${user.id}`)}
                        >
                          {messages.userManagement.viewProfile}
                        </button>
                        {user.role !== 'ADMIN' ? (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(workingId)}
                              onClick={() => {
                                onOpenAction(null);
                                onEdit(user);
                              }}
                            >
                              {messages.userManagement.edit}
                            </button>
                            {user.status !== 'BLOCKED' &&
                            (user.status === 'ACTIVE' ||
                              user.status === 'RESET') ? (
                              <button
                                type="button"
                                onClick={() => onPasswordReset(user)}
                                disabled={Boolean(workingId)}
                              >
                                {user.status === 'RESET' ||
                                user.passwordResetRequired
                                  ? messages.userManagement.resendReset
                                  : messages.userManagement.resetPassword}
                              </button>
                            ) : null}
                            {user.status === 'BLOCKED' ? (
                              <button
                                type="button"
                                className="danger-action"
                                onClick={() => onUnblock(user)}
                                disabled={Boolean(workingId)}
                              >
                                {messages.userManagement.unblock}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="danger-action"
                                onClick={() => onBlock(user)}
                                disabled={Boolean(workingId)}
                              >
                                {messages.userManagement.block}
                              </button>
                            )}
                            <button
                              type="button"
                              className="danger-action"
                              onClick={() => onDelete(user)}
                              disabled={Boolean(workingId)}
                            >
                              {messages.userManagement.delete}
                            </button>
                          </>
                        ) : null}
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

function InvitationsTable({
  invitations,
  workingId,
  openActionId,
  onOpenAction,
  onResend,
  onCancel,
}: {
  invitations: Manager[];
  workingId: string | null;
  openActionId: string | null;
  onOpenAction: (id: string | null) => void;
  onResend: (manager: Manager) => void;
  onCancel: (manager: Manager) => void;
}) {
  const { messages } = useI18n();
  if (!invitations.length)
    return (
      <div className="users-empty">
        {messages.userManagement.emptyInvitations}
      </div>
    );
  return (
    <div className="users-table-wrap">
      <table className="users-table">
        <thead>
          <tr>
            <th>{messages.userManagement.colProfile}</th>
            <th>{messages.userManagement.colEmail}</th>
            <th>{messages.userManagement.colRole}</th>
            <th>{messages.userManagement.colStatus}</th>
            <th>{messages.userManagement.colActions}</th>
          </tr>
        </thead>
        <tbody
          className="table-change-animate"
          key={`inv-rows-${invitations.length}`}
        >
          {invitations.map((manager) => (
            <tr key={manager.id}>
              <td data-label={messages.userManagement.colProfile}>
                <div className="cell-profile">
                  <span className="user-avatar">
                    {manager.firstName.charAt(0)}
                    {manager.lastName.charAt(0)}
                  </span>
                  <span
                    className="cell-truncate"
                    title={`${manager.firstName} ${manager.lastName}`}
                  >
                    {manager.firstName} {manager.lastName}
                  </span>
                </div>
              </td>
              <td
                data-label={messages.userManagement.colEmail}
                title={manager.email}
              >
                {manager.email}
              </td>
              <td data-label={messages.userManagement.colRole}>
                <StatusPill value={manager.role} />
              </td>
              <td data-label={messages.userManagement.colStatus}>
                <StatusPill value={manager.invitationStatus} />
              </td>
              <td data-label={messages.userManagement.colActions}>
                <div className="row-menu">
                  <button
                    className="row-menu-trigger"
                    type="button"
                    aria-label={interpolate(
                      messages.userManagement.actionsFor,
                      { name: `${manager.firstName} ${manager.lastName}` },
                    )}
                    aria-expanded={openActionId === manager.id}
                    onClick={() =>
                      onOpenAction(
                        openActionId === manager.id ? null : manager.id,
                      )
                    }
                  >
                    <span aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                  {openActionId === manager.id ? (
                    <div className="row-menu-panel">
                      <button
                        type="button"
                        onClick={() => onResend(manager)}
                        disabled={Boolean(workingId)}
                      >
                        {messages.userManagement.resend}
                      </button>
                      {manager.invitationStatus !== 'EXPIRED' &&
                      manager.invitationStatus !== 'CANCELLED' ? (
                        <button
                          type="button"
                          className="danger-action"
                          onClick={() => onCancel(manager)}
                          disabled={Boolean(workingId)}
                        >
                          {messages.userManagement.cancel}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddUserDrawer({
  managers,
  onClose,
  onSubmit,
}: {
  managers: ManagedUser[];
  onClose: () => void;
  onSubmit: (input: {
    email: string;
    role: DrawerRole;
    firstName?: string;
    lastName?: string;
    phone?: string;
    mfaEnabled: boolean;
    managerId?: string;
  }) => Promise<void>;
}) {
  const { messages } = useI18n();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<DrawerRole>('MANAGER');
  const [managerId, setManagerId] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        mfaEnabled,
        managerId: role === 'AGENT' ? managerId : undefined,
      });
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`drawer-backdrop${isClosing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <aside
        className={`user-drawer${isClosing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={handleClose}
          aria-label={messages.userManagement.drawerClose}
        >
          ×
        </button>
        <h2 id="drawer-title">{messages.userManagement.drawerTitle}</h2>
        <p>{messages.userManagement.drawerSubtitle}</p>
        <hr />
        <form onSubmit={submit}>
          <DrawerField label={messages.userManagement.drawerNameLabel}>
            <div className="drawer-name-fields">
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder={messages.userManagement.drawerFirstNamePlaceholder}
              />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder={messages.userManagement.drawerLastNamePlaceholder}
              />
            </div>
          </DrawerField>
          <DrawerField label={messages.userManagement.drawerPhoneLabel}>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={messages.userManagement.drawerPhonePlaceholder}
            />
          </DrawerField>
          <DrawerField
            label={messages.userManagement.drawerEmailLabel}
            required
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={messages.userManagement.drawerEmailPlaceholder}
              required
              style={
                email.trim() && !isEmailDomainAllowed(email)
                  ? { borderColor: '#e63946', backgroundColor: '#fff8f8' }
                  : undefined
              }
            />
            {email.trim() && !isEmailDomainAllowed(email) && (
              <span
                style={{
                  color: '#e63946',
                  fontSize: '0.82rem',
                  marginTop: '0.25rem',
                  display: 'block',
                }}
              >
                {getEmailDomainWhitelistErrorMessage(
                  undefined,
                  messages.userManagement.emailDomainNotAllowed,
                )}
              </span>
            )}
          </DrawerField>
          <DrawerField label={messages.userManagement.drawerRoleLabel} required>
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as DrawerRole);
                setManagerId('');
              }}
            >
              <option value="MANAGER">
                {messages.userManagement.roleManager}
              </option>
              <option value="AGENT">{messages.userManagement.roleAgent}</option>
            </select>
          </DrawerField>
          {role === 'AGENT' ? (
            <DrawerField
              label={messages.userManagement.drawerManagerLabel}
              required
            >
              <select
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                required
              >
                <option value="" disabled>
                  {messages.userManagement.drawerManagerPlaceholder}
                </option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </select>
              {managers.length === 0 ? (
                <span
                  style={{
                    color: '#e63946',
                    fontSize: '0.82rem',
                    marginTop: '0.25rem',
                    display: 'block',
                  }}
                >
                  {messages.userManagement.drawerNoManagersAvailable}
                </span>
              ) : null}
            </DrawerField>
          ) : null}
          <label className="drawer-check">
            <input
              type="checkbox"
              checked={mfaEnabled}
              onChange={(event) => setMfaEnabled(event.target.checked)}
            />{' '}
            <span>{messages.userManagement.drawerMfaLabel}</span>
          </label>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={handleClose}
            >
              {messages.userManagement.drawerCancel}
            </button>
            <button
              className="orange-button"
              type="submit"
              disabled={
                isSubmitting ||
                !email.trim() ||
                !isEmailDomainAllowed(email) ||
                (role === 'AGENT' && !managerId)
              }
            >
              {isSubmitting
                ? messages.userManagement.drawerSubmitting
                : messages.userManagement.drawerSubmit}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function getAccessError(reason: unknown, fallback: string) {
  return reason instanceof ApiError ? reason.message : fallback;
}
