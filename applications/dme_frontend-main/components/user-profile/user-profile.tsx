'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authApi } from '@/lib/api';
import { DEBUG_SKELETON } from '@/lib/skeleton';
import type { ManagedUser } from '@/types/auth';
import { StatusPill } from '@/components/user-management/status-pill';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { EditUserDrawer } from '@/components/user-management/edit-user-drawer';
import {
  ConnectionHistory,
  ProfileField,
  TeamOverview,
  TeamOverviewSkeleton,
  formatLastConnection,
} from './profile-shared';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

export function UserProfile({ userId }: { userId: string }) {
  const router = useRouter();
  const { messages } = useI18n();
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  useEffect(() => {
    void authApi
      .listUsers()
      .then((users) => {
        const selected = users.find((item) => item.id === userId);
        if (!selected) setError(messages.profile.errorNotFound);
        else setUser(selected);
      })
      .catch(() => setError(messages.profile.errorDetailsUnavailable));
  }, [userId, messages]);

  function handleBlockClick() {
    if (!user || user.role === 'ADMIN') return;
    const name = `${user.firstName} ${user.lastName}`;
    if (user.status === 'BLOCKED') {
      setDialog({
        title: messages.profile.dialogUnblockTitle,
        message: interpolate(messages.profile.dialogUnblockMessage, { name }),
        actionLabel: messages.profile.dialogUnblockAction,
        variant: 'unblock',
        onConfirm: async () => {
          setIsWorking(true);
          setError(null);
          try {
            await authApi.unblockUser(user.id);
            setUser((prev) => (prev ? { ...prev, status: 'ACTIVE' } : null));
            setNotice(messages.profile.noticeUnblocked);
            setDialog(null);
          } catch {
            setError(messages.profile.errorUnblockFailed);
            setDialog(null);
          } finally {
            setIsWorking(false);
          }
        },
      });
    } else {
      setDialog({
        title: messages.profile.dialogBlockTitle,
        message: interpolate(messages.profile.dialogBlockMessage, { name }),
        actionLabel: messages.profile.dialogBlockAction,
        tone: 'danger',
        variant: 'block',
        onConfirm: async () => {
          setIsWorking(true);
          setError(null);
          try {
            await authApi.blockUser(user.id);
            setUser((prev) => (prev ? { ...prev, status: 'BLOCKED' } : null));
            setNotice(messages.profile.noticeBlocked);
            setDialog(null);
          } catch {
            setError(messages.profile.errorBlockFailed);
            setDialog(null);
          } finally {
            setIsWorking(false);
          }
        },
      });
    }
  }

  function handlePasswordResetClick() {
    if (
      !user ||
      user.role === 'ADMIN' ||
      user.status === 'BLOCKED' ||
      (user.status !== 'ACTIVE' && user.status !== 'RESET')
    )
      return;
    const targetEmail = user.email;
    const isResetState = user.status === 'RESET' || user.passwordResetRequired;
    if (isResetState) {
      setDialog({
        title: messages.profile.dialogResendResetTitle,
        message: interpolate(messages.profile.dialogResendResetMessage, {
          email: targetEmail,
        }),
        actionLabel: messages.profile.dialogResendResetAction,
        onConfirm: async () => {
          setIsWorking(true);
          setError(null);
          try {
            await authApi.requireUserPasswordReset(user.id);
            setNotice(
              interpolate(messages.profile.noticeResendResetSent, {
                email: targetEmail,
              }),
            );
            setDialog(null);
          } catch {
            setError(messages.profile.errorResendResetFailed);
            setDialog(null);
          } finally {
            setIsWorking(false);
          }
        },
      });
      return;
    }
    setDialog({
      title: messages.profile.dialogResetTitle,
      message: interpolate(messages.profile.dialogResetMessage, {
        email: targetEmail,
      }),
      actionLabel: messages.profile.dialogResetAction,
      variant: 'password-reset-request',
      email: targetEmail,
      user,
      onConfirm: async () => {
        setIsWorking(true);
        setError(null);
        try {
          await authApi.requireUserPasswordReset(user.id);
          setUser((prev) =>
            prev ? { ...prev, passwordResetRequired: true } : null,
          );
          setNotice(
            interpolate(messages.profile.noticeInstructionsSent, {
              email: targetEmail,
            }),
          );
          const showSuccess = () => {
            setDialog({
              title: '',
              message: '',
              actionLabel: messages.profile.dialogCloseAction,
              variant: 'password-reset',
              email: targetEmail,
              onConfirm: async () => {
                setIsWorking(true);
                try {
                  await authApi.requireUserPasswordReset(user.id);
                  setNotice(
                    interpolate(messages.profile.noticeNewEmailSent, {
                      email: targetEmail,
                    }),
                  );
                } catch {
                  setError(messages.profile.errorEmailResendFailed);
                } finally {
                  setIsWorking(false);
                }
              },
            });
          };
          showSuccess();
        } catch {
          setError(messages.profile.errorResetScheduleFailed);
          setDialog(null);
        } finally {
          setIsWorking(false);
        }
      },
    });
  }

  if (error)
    return (
      <section className="profile-error" role="alert">
        {error}
        <button type="button" onClick={() => router.back()}>
          {messages.profile.back}
        </button>
      </section>
    );
  if (!user || DEBUG_SKELETON) return <UserProfileSkeleton router={router} />;
  const canManage = user.role !== 'ADMIN';

  return (
    <section className="user-profile-page" aria-labelledby="profile-title">
      {notice ? (
        <div className="profile-notice" role="status">
          {notice}
        </div>
      ) : null}
      <div className="profile-breadcrumb">
        <button type="button" onClick={() => router.push('/users')}>
          {messages.profile.breadcrumbUsers}
        </button>
        <span>›</span>
        <strong>{messages.profile.breadcrumbDetails}</strong>
      </div>
      <div className="profile-heading">
        <h1 id="profile-title">
          <strong>{messages.profile.pageTitleDetailsStrong}</strong>
          {messages.profile.pageTitleDetailsRest}
        </h1>
        <div className="profile-actions">
          {canManage &&
          user.status !== 'BLOCKED' &&
          (user.status === 'ACTIVE' || user.status === 'RESET') ? (
            <button
              type="button"
              className="profile-outline"
              onClick={handlePasswordResetClick}
              disabled={isWorking}
            >
              {user.status === 'RESET' || user.passwordResetRequired
                ? messages.profile.resendReset
                : messages.profile.resetPassword}
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="profile-outline profile-danger"
              onClick={handleBlockClick}
              disabled={isWorking}
            >
              {user.status === 'BLOCKED'
                ? messages.profile.unblockUser
                : messages.profile.blockUser}
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="profile-primary"
              disabled={isWorking}
              onClick={() => {
                setError(null);
                setEditDrawerOpen(true);
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="profile-edit-icon"
                aria-hidden="true"
              >
                <path
                  d="M11.7.3c-.4 0-.8.1-1.1.4L2.3 8.9c-.2.2-.3.4-.4.7l-1 3.5c-.1.3 0 .7.3.9.2.2.5.3.8.3h.2l3.5-1c.3-.1.5-.2.7-.4L14.7 4.6c.6-.6.6-1.6 0-2.2L13.5.7C13 .3 12.4.3 11.7.3zm0 1.5 1.8 1.8-1.5 1.5-1.8-1.8 1.5-1.5zM9 4.3l1.8 1.8-6.1 6.1-2 .6.6-2L9 4.3z"
                  fill="currentColor"
                />
              </svg>
              <span>{messages.profile.editProfile}</span>
            </button>
          ) : null}
        </div>
      </div>
      <article className="profile-identity">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            {user.firstName.charAt(0)}
            {user.lastName.charAt(0)}
          </div>
          <span
            className={user.isOnline ? 'profile-online' : 'profile-offline'}
            title={
              user.isOnline ? messages.profile.online : messages.profile.offline
            }
            aria-hidden="true"
          />
        </div>
        <div className="profile-identity-info">
          <div className="profile-name-row">
            <h2>
              {user.firstName} {user.lastName}
            </h2>
            <span
              className={`b2b-status b2b-status-${user.role.toLowerCase()}`}
            >
              {messages.profile.dmePrefix}{' '}
              {user.role === 'MANAGER'
                ? 'MANAGER'
                : user.role === 'AGENT'
                  ? 'AGENT'
                  : 'ADMIN'}
            </span>
            <StatusPill
              value={user.passwordResetRequired ? 'RESET' : user.status}
            />
          </div>
          <p className="profile-email">{user.email}</p>
          <div className="profile-meta">
            <span>
              <Image
                src="/clock.svg"
                alt=""
                width={15}
                height={15}
                aria-hidden="true"
              />
              {messages.profile.lastConnectionPrefix}
              {formatLastConnection(
                user.lastActive ?? user.latestLogin,
                user.isOnline,
                messages.profile,
              )}
            </span>
            <span>
              <Image
                src="/pin.svg"
                alt=""
                width={15}
                height={15}
                aria-hidden="true"
              />
              {messages.profile.officeLocation}
            </span>
          </div>
        </div>
      </article>
      <div className="profile-grid">
        <div className="profile-grid-left">
          <div className="profile-info-row">
            <section className="profile-card">
              <h2>
                <Image
                  src="/user-2.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="profile-h2-icon"
                  aria-hidden="true"
                />
                <span>{messages.profile.personalInfoTitle}</span>
              </h2>
              <ProfileField
                label={messages.profile.fullName}
                value={`${user.firstName} ${user.lastName}`}
              />
              <ProfileField
                label={messages.profile.emailAddress}
                value={user.email}
              />
              <ProfileField
                label={messages.profile.phone}
                value={user.phone ?? messages.profile.defaultPhone}
              />
              <ProfileField
                label={messages.profile.office}
                value={messages.profile.defaultOffice}
              />
            </section>
            <section className="profile-card">
              <h2>
                <Image
                  src="/lock.svg"
                  alt=""
                  width={20}
                  height={22}
                  className="profile-h2-icon"
                  aria-hidden="true"
                />
                <span>{messages.profile.accountSecurityTitle}</span>
              </h2>
              <div className="profile-security-row">
                <span className="profile-security-label">
                  {messages.profile.accountRole}
                </span>
                <strong className="profile-security-role">
                  {messages.profile.dmePrefix}{' '}
                  {user.role === 'MANAGER'
                    ? messages.profile.roleManager
                    : user.role === 'AGENT'
                      ? messages.profile.roleAgent
                      : messages.profile.roleAdmin}
                </strong>
              </div>
              <div className="profile-security-row">
                <span className="profile-security-label">
                  {messages.profile.mfaStatus}
                </span>
                <span className="profile-security-mfa">
                  <span className="profile-mfa-dot">✔</span>{' '}
                  {messages.profile.mfaActive}
                </span>
              </div>
              <hr className="profile-security-divider" />
              <ProfileField
                label={messages.profile.lastPasswordChangeLabel}
                value={messages.profile.lastPasswordChangeValue}
              />
              <ProfileField
                label={messages.profile.accountCreatedLabel}
                value={messages.profile.accountCreatedValue}
              />
            </section>
          </div>
          <ConnectionHistory userId={user.id} />
        </div>
        <div className="profile-grid-right">
          <TeamOverview
            userId={user.id}
            assignmentAccountId={user.accountId}
            role={user.role}
            managerName={user.managerName}
          />
        </div>
      </div>
      {dialog ? (
        <ConfirmDialog
          dialog={dialog}
          isWorking={isWorking}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {editDrawerOpen ? (
        <EditUserDrawer
          user={user}
          onClose={() => setEditDrawerOpen(false)}
          onSubmit={async (input) => {
            try {
              const updated = await authApi.updateUser(user.id, input);
              setUser(updated);
              setNotice(
                interpolate(messages.profile.noticeUserUpdated, {
                  name: `${updated.firstName} ${updated.lastName}`,
                }),
              );
            } catch {
              setError(messages.profile.errorUpdateUserFailed);
              throw new Error('update failed');
            }
          }}
        />
      ) : null}
    </section>
  );
}

function UserProfileSkeleton({
  router,
}: {
  router: { push: (url: string) => void };
}) {
  const { messages } = useI18n();
  return (
    <section className="user-profile-page" aria-labelledby="profile-title-skel">
      <div className="profile-breadcrumb">
        <button type="button" onClick={() => router.push('/users')}>
          {messages.profile.breadcrumbUsers}
        </button>
        <span>›</span>
        <strong>{messages.profile.breadcrumbDetails}</strong>
      </div>
      <div className="profile-heading">
        <h1 id="profile-title-skel">
          <strong>{messages.profile.pageTitleDetailsStrong}</strong>
          {messages.profile.pageTitleDetailsRest}
        </h1>
        <div className="profile-actions">
          <button
            type="button"
            className="profile-outline"
            disabled
            style={{ width: 190, height: 38 }}
          >
            <span className="skeleton-box" style={{ width: 150, height: 14 }} />
          </button>
          <button
            type="button"
            className="profile-outline profile-danger"
            disabled
            style={{ width: 160, height: 38 }}
          >
            <span className="skeleton-box" style={{ width: 120, height: 14 }} />
          </button>
          <button
            type="button"
            className="profile-primary"
            disabled
            style={{ width: 150, height: 38 }}
          >
            <span className="skeleton-box" style={{ width: 110, height: 14 }} />
          </button>
        </div>
      </div>
      <article className="profile-identity">
        <div className="profile-avatar-wrap">
          <div
            className="profile-avatar skeleton-circle"
            style={{ background: 'transparent' }}
          >
            <span
              className="skeleton-circle"
              style={{ width: 84, height: 84 }}
            />
          </div>
        </div>
        <div className="profile-identity-info">
          <div className="profile-name-row">
            <h2>
              <span
                className="skeleton-box"
                style={{ width: 200, height: 26 }}
              />
            </h2>
            <span
              className="skeleton-box"
              style={{ width: 95, height: 26, borderRadius: 6 }}
            />
            <span
              className="skeleton-box"
              style={{ width: 65, height: 26, borderRadius: 999 }}
            />
          </div>
          <p className="profile-email">
            <span className="skeleton-box" style={{ width: 180, height: 16 }} />
          </p>
          <div className="profile-meta">
            <span>
              <Image
                src="/clock.svg"
                alt=""
                width={15}
                height={15}
                aria-hidden="true"
              />
              <span
                className="skeleton-box"
                style={{ width: 210, height: 14 }}
              />
            </span>
            <span>
              <Image
                src="/pin.svg"
                alt=""
                width={15}
                height={15}
                aria-hidden="true"
              />
              <span
                className="skeleton-box"
                style={{ width: 70, height: 14 }}
              />
            </span>
          </div>
        </div>
      </article>
      <div className="profile-grid">
        <div className="profile-grid-left">
          <div className="profile-info-row">
            <section className="profile-card">
              <h2>
                <Image
                  src="/user-2.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="profile-h2-icon"
                  aria-hidden="true"
                />
                <span>{messages.profile.personalInfoTitle}</span>
              </h2>
              <div className="profile-field">
                <small>{messages.profile.fullName}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 140, height: 16 }}
                  />
                </strong>
              </div>
              <div className="profile-field">
                <small>{messages.profile.emailAddress}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 180, height: 16 }}
                  />
                </strong>
              </div>
              <div className="profile-field">
                <small>{messages.profile.phone}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 120, height: 16 }}
                  />
                </strong>
              </div>
              <div className="profile-field">
                <small>{messages.profile.office}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 150, height: 16 }}
                  />
                </strong>
              </div>
            </section>
            <section className="profile-card">
              <h2>
                <Image
                  src="/lock.svg"
                  alt=""
                  width={20}
                  height={22}
                  className="profile-h2-icon"
                  aria-hidden="true"
                />
                <span>{messages.profile.accountSecurityTitle}</span>
              </h2>
              <div className="profile-security-row">
                <span className="profile-security-label">
                  {messages.profile.accountRole}
                </span>
                <strong className="profile-security-role">
                  <span
                    className="skeleton-box"
                    style={{ width: 90, height: 16 }}
                  />
                </strong>
              </div>
              <div className="profile-security-row">
                <span className="profile-security-label">
                  {messages.profile.mfaStatus}
                </span>
                <span className="profile-security-mfa">
                  <span
                    className="skeleton-box"
                    style={{ width: 70, height: 16 }}
                  />
                </span>
              </div>
              <hr className="profile-security-divider" />
              <div className="profile-field">
                <small>{messages.profile.lastPasswordChangeLabel}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 130, height: 16 }}
                  />
                </strong>
              </div>
              <div className="profile-field">
                <small>{messages.profile.accountCreatedLabel}</small>
                <strong style={{ marginTop: 4 }}>
                  <span
                    className="skeleton-box"
                    style={{ width: 110, height: 16 }}
                  />
                </strong>
              </div>
            </section>
          </div>
          <ConnectionHistory showSkeleton={true} />
        </div>
        <div className="profile-grid-right">
          <TeamOverviewSkeleton />
        </div>
      </div>
    </section>
  );
}
