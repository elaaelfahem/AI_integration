'use client';

import Link from 'next/link';
import {
  EMAIL_PREFERENCE_ROLES,
  type EmailPreferenceKey,
} from '@/types/notifications';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Avatar } from '@/components/shared/avatar';
import { Toast } from '@/components/auth/toast';
import type { ManagedUser } from '@/types/auth';

export function SettingsPage() {
  const { account, logout } = useAuth();
  const { messages } = useI18n();
  const t = messages.settingsPage;

  const [profile, setProfile] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarRefresh, setAvatarRefresh] = useState(0);
  const [savingNotify, setSavingNotify] = useState(false);
  const [mfaConfirmOpen, setMfaConfirmOpen] = useState(false);
  const [mfaPassword, setMfaPassword] = useState('');
  const [disablingMfa, setDisablingMfa] = useState(false);
  const [mfaEnableOpen, setMfaEnableOpen] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [startingMfaSetup, setStartingMfaSetup] = useState(false);
  const [mfaEnableCode, setMfaEnableCode] = useState('');
  const [enablingMfa, setEnablingMfa] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getOwnProfile()
      .then((profileResult) => {
        if (cancelled) return;
        setProfile(profileResult);
        setFirstName(profileResult.firstName);
        setLastName(profileResult.lastName);
        setPhone(profileResult.phone ?? '');
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveProfile() {
    setError('');
    setSavingProfile(true);
    try {
      const updated = await authApi.updateOwnProfile({
        firstName,
        lastName,
        phone: phone.trim() || null,
      });
      setProfile(updated);
      setNotice(t.noticeProfileSaved);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorProfileFailed,
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarChange(file: File) {
    setUploadingAvatar(true);
    setError('');
    try {
      const updated = await authApi.uploadOwnAvatar(file);
      setProfile(updated);
      setAvatarRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorAvatarFailed);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setUploadingAvatar(true);
    setError('');
    try {
      const updated = await authApi.removeOwnAvatar();
      setProfile(updated);
      setAvatarRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorAvatarFailed);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleDisableMfa() {
    if (!mfaPassword.trim()) return;
    setDisablingMfa(true);
    setError('');
    try {
      await authApi.disableTotp(mfaPassword);
      setProfile((current) =>
        current ? { ...current, mfaMethod: 'EMAIL' } : current,
      );
      setMfaConfirmOpen(false);
      setMfaPassword('');
      setNotice(t.noticeMfaDisabled);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorMfaDisableFailed,
      );
    } finally {
      setDisablingMfa(false);
    }
  }

  async function handleStartMfaEnable() {
    setMfaSetup(null);
    setMfaEnableOpen(true);
    setStartingMfaSetup(true);
    setError('');
    try {
      const result = await authApi.setupTotpForSelf();
      setMfaSetup(result);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorMfaEnableFailed,
      );
      setMfaEnableOpen(false);
    } finally {
      setStartingMfaSetup(false);
    }
  }

  async function handleConfirmMfaEnable() {
    if (!mfaEnableCode.trim()) return;
    setEnablingMfa(true);
    setError('');
    try {
      await authApi.confirmTotpForSelf(mfaEnableCode.trim());
      setProfile((current) =>
        current ? { ...current, mfaMethod: 'AUTH' } : current,
      );
      setMfaEnableOpen(false);
      setMfaSetup(null);
      setMfaEnableCode('');
      setNotice(t.noticeMfaEnabled);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorMfaEnableFailed,
      );
    } finally {
      setEnablingMfa(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword.trim() || !newPassword.trim()) return;
    setChangingPassword(true);
    setError('');
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      // The password change revokes the current session server-side, so
      // sign out locally too and let the sign-in screen confirm the change.
      await logout();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorPasswordChangeFailed,
      );
      setChangingPassword(false);
    }
  }

  async function handleToggleNotify(
    key: 'notifyAnalysisResults' | 'notifyWorkUpdates',
  ) {
    if (!profile) return;
    setSavingNotify(true);
    setError('');
    try {
      const updated = await authApi.updateNotificationPreferences({
        [key]: !(profile[key] ?? true),
      });
      setProfile(updated);
      setNotice(t.noticeNotificationsSaved);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorNotificationsFailed,
      );
    } finally {
      setSavingNotify(false);
    }
  }

  async function handleToggleEmailPreference(key: EmailPreferenceKey) {
    if (!profile) return;
    setSavingNotify(true);
    setError('');
    try {
      const updated = await authApi.updateNotificationPreferences({
        emailPreferences: { [key]: profile.emailPreferences?.[key] === false },
      });
      setProfile(updated);
      setNotice(t.noticeNotificationsSaved);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t.errorNotificationsFailed,
      );
    } finally {
      setSavingNotify(false);
    }
  }

  if (loading || !profile || !account) {
    return (
      <section className="users-page settings-page" id="settings">
        <div className="users-page-header">
          <h1>
            <span className="skeleton-box" style={{ width: 220, height: 24 }} />
          </h1>
        </div>
        <div className="settings-grid">
          <section className="settings-card">
            <span
              className="skeleton-box"
              style={{ width: 120, height: 18, marginBottom: '1rem' }}
            />
            <div className="settings-avatar-row">
              <span
                className="skeleton-circle"
                style={{ width: 64, height: 64 }}
              />
              <span
                className="skeleton-box"
                style={{ width: 140, height: 36 }}
              />
            </div>
            <div className="settings-field-row">
              <span className="skeleton-box" style={{ height: 40 }} />
              <span className="skeleton-box" style={{ height: 40 }} />
            </div>
            <span className="skeleton-box" style={{ height: 40 }} />
          </section>
          <div className="settings-grid-secondary">
            <section className="settings-card">
              <span
                className="skeleton-box"
                style={{ width: 120, height: 18, marginBottom: '1rem' }}
              />
              <span className="skeleton-box" style={{ height: 32 }} />
            </section>
            <section className="settings-card">
              <span
                className="skeleton-box"
                style={{ width: 120, height: 18, marginBottom: '1rem' }}
              />
              <span className="skeleton-box" style={{ height: 32 }} />
            </section>
          </div>
        </div>
      </section>
    );
  }

  const mfaActive = profile.mfaMethod === 'AUTH';

  return (
    <section
      className="users-page settings-page"
      id="settings"
      aria-labelledby="settings-title"
    >
      <div className="users-page-header">
        <h1 id="settings-title">
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

      <div className="settings-grid">
        <section className="settings-card">
          <h2>{t.sectionProfile}</h2>
          <div className="settings-avatar-row">
            <div className="profile-avatar-wrap settings-avatar-wrap">
              <Avatar
                userId={account.id}
                hasAvatar={profile.hasAvatar}
                firstName={profile.firstName}
                lastName={profile.lastName}
                refreshKey={avatarRefresh}
              />
            </div>
            <div className="settings-avatar-actions">
              <button
                className="outline-button"
                type="button"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? t.avatarUploading : t.avatarChange}
              </button>
              {profile.hasAvatar ? (
                <button
                  className="outline-button"
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => void handleAvatarRemove()}
                >
                  {t.avatarRemove}
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleAvatarChange(file);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
          <label className="drawer-field">
            <span>{t.fieldEmail}</span>
            <input type="email" value={profile.email} readOnly disabled />
          </label>
          <div className="settings-field-row">
            <label className="drawer-field">
              <span>{t.fieldFirstName}</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </label>
            <label className="drawer-field">
              <span>{t.fieldLastName}</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </label>
          </div>
          <label className="drawer-field">
            <span>{t.fieldPhone}</span>
            <input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.phonePlaceholder}
            />
          </label>
          <div className="settings-actions">
            <button
              className="orange-button"
              type="button"
              disabled={savingProfile}
              onClick={() => void handleSaveProfile()}
            >
              {savingProfile ? t.savingProfile : t.saveProfile}
            </button>
          </div>
        </section>

        <div className="settings-grid-secondary">
          <section className="settings-card">
            <h2>{t.sectionSecurity}</h2>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">{t.mfaLabel}</span>
                <p className="settings-toggle-hint">
                  {mfaActive ? t.mfaEnabled : t.mfaNotEnabled}
                  {!mfaActive ? ` · ${t.mfaNotEnabledHint}` : ''}
                </p>
              </div>
              {mfaActive ? (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => setMfaConfirmOpen(true)}
                >
                  {t.mfaDisableButton}
                </button>
              ) : (
                <button
                  className="outline-button"
                  type="button"
                  disabled={startingMfaSetup}
                  onClick={() => void handleStartMfaEnable()}
                >
                  {startingMfaSetup ? t.mfaEnabling : t.mfaEnableButton}
                </button>
              )}
            </div>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">
                  {t.changePasswordLabel}
                </span>
                <p className="settings-toggle-hint">{t.changePasswordHint}</p>
              </div>
              <button
                className="outline-button"
                type="button"
                onClick={() => setPasswordModalOpen(true)}
              >
                {t.changePasswordButton}
              </button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-header">
              <h2>{t.sectionNotifications}</h2>
              <Link
                className="settings-card-link"
                href="/settings/notifications"
              >
                {messages.notifications.viewAll} →
              </Link>
            </div>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">
                  {t.notifyAnalysisLabel}
                </span>
                <p className="settings-toggle-hint">{t.notifyAnalysisHint}</p>
              </div>
              <button
                type="button"
                className={`user-toggle${profile.notifyAnalysisResults ? ' user-toggle-on' : ''}`}
                disabled={savingNotify}
                onClick={() => void handleToggleNotify('notifyAnalysisResults')}
                aria-pressed={!!profile.notifyAnalysisResults}
              >
                <span aria-hidden="true">
                  {profile.notifyAnalysisResults ? '✓' : ''}
                </span>
              </button>
            </div>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">
                  {t.notifyWorkLabel}
                </span>
                <p className="settings-toggle-hint">{t.notifyWorkHint}</p>
              </div>
              <button
                type="button"
                className={`user-toggle${profile.notifyWorkUpdates !== false ? ' user-toggle-on' : ''}`}
                disabled={savingNotify}
                onClick={() => void handleToggleNotify('notifyWorkUpdates')}
                aria-pressed={profile.notifyWorkUpdates !== false}
              >
                <span aria-hidden="true">
                  {profile.notifyWorkUpdates !== false ? '✓' : ''}
                </span>
              </button>
            </div>
            <div className="settings-subtoggles">
              <p className="settings-subtoggles-title">{t.notifyByTypeTitle}</p>
              {profile.notifyWorkUpdates === false ? (
                <p className="settings-toggle-hint">
                  {t.notifyByTypeDisabledHint}
                </p>
              ) : null}
              {(
                [
                  [
                    'ticketReply',
                    t.notifyTicketReplyLabel,
                    t.notifyTicketReplyHint,
                  ],
                  [
                    'ticketAssigned',
                    t.notifyTicketAssignedLabel,
                    t.notifyTicketAssignedHint,
                  ],
                  [
                    'meetingReminder',
                    t.notifyMeetingReminderLabel,
                    t.notifyMeetingReminderHint,
                  ],
                  [
                    'reportSubmitted',
                    t.notifyReportSubmittedLabel,
                    t.notifyReportSubmittedHint,
                  ],
                  [
                    'reportReviewed',
                    t.notifyReportReviewedLabel,
                    t.notifyReportReviewedHint,
                  ],
                  ['noteAdded', t.notifyNoteAddedLabel, t.notifyNoteAddedHint],
                ] as const
              )
                .filter(([key]) =>
                  EMAIL_PREFERENCE_ROLES[key].includes(account.role),
                )
                .map(([key, label, hint]) => {
                  const masterOff = profile.notifyWorkUpdates === false;
                  const isOn =
                    !masterOff && profile.emailPreferences?.[key] !== false;
                  return (
                    <div
                      className={`settings-toggle-row${masterOff ? ' settings-toggle-row-disabled' : ''}`}
                      key={key}
                    >
                      <div>
                        <span className="settings-toggle-label">{label}</span>
                        <p className="settings-toggle-hint">{hint}</p>
                      </div>
                      <button
                        type="button"
                        className={`user-toggle${isOn ? ' user-toggle-on' : ''}`}
                        disabled={savingNotify || masterOff}
                        onClick={() => void handleToggleEmailPreference(key)}
                        aria-pressed={isOn}
                        aria-label={label}
                      >
                        <span aria-hidden="true">{isOn ? '✓' : ''}</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </div>

      {mfaConfirmOpen ? (
        <div
          className="b2b-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !disablingMfa) {
              setMfaConfirmOpen(false);
            }
          }}
        >
          <section
            className="b2b-modal b2b-modal-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mfa-disable-title"
          >
            <button
              className="b2b-modal-close"
              type="button"
              onClick={() => setMfaConfirmOpen(false)}
              disabled={disablingMfa}
              aria-label={t.mfaDisableCancel}
            >
              ×
            </button>
            <h3 id="mfa-disable-title">{t.mfaDisableConfirmTitle}</h3>
            <p className="b2b-modal-message">{t.mfaDisableConfirmMessage}</p>
            <hr />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleDisableMfa();
              }}
            >
              <label className="drawer-field">
                <span>{t.mfaPasswordLabel}</span>
                <input
                  type="password"
                  value={mfaPassword}
                  onChange={(event) => setMfaPassword(event.target.value)}
                  placeholder={t.mfaPasswordPlaceholder}
                  disabled={disablingMfa}
                  autoFocus
                />
              </label>
              <div className="b2b-modal-actions">
                <button
                  className="b2b-button b2b-button-danger"
                  type="submit"
                  disabled={disablingMfa || !mfaPassword.trim()}
                >
                  {disablingMfa ? t.mfaDisabling : t.mfaDisableConfirm}
                </button>
                <button
                  className="b2b-button b2b-button-secondary"
                  type="button"
                  disabled={disablingMfa}
                  onClick={() => setMfaConfirmOpen(false)}
                >
                  {t.mfaDisableCancel}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {mfaEnableOpen ? (
        <div
          className="b2b-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !enablingMfa) {
              setMfaEnableOpen(false);
            }
          }}
        >
          <section
            className="b2b-modal b2b-modal-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mfa-enable-title"
          >
            <button
              className="b2b-modal-close"
              type="button"
              onClick={() => setMfaEnableOpen(false)}
              disabled={enablingMfa}
              aria-label={t.mfaEnableCancel}
            >
              ×
            </button>
            <h3 id="mfa-enable-title">{t.mfaEnableTitle}</h3>
            {mfaSetup ? (
              <>
                <p className="b2b-modal-message">{t.mfaEnableIntro}</p>
                <hr />
                <div className="settings-mfa-qr-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mfaSetup.qrCodeDataUrl}
                    alt=""
                    width={180}
                    height={180}
                  />
                  <p className="settings-toggle-hint">
                    {t.mfaEnableSecretLabel}
                    <br />
                    <code>{mfaSetup.secret}</code>
                  </p>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleConfirmMfaEnable();
                  }}
                >
                  <label className="drawer-field">
                    <span>{t.mfaEnableCodeLabel}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaEnableCode}
                      onChange={(event) => setMfaEnableCode(event.target.value)}
                      placeholder={t.mfaEnableCodePlaceholder}
                      disabled={enablingMfa}
                      autoFocus
                    />
                  </label>
                  <div className="b2b-modal-actions">
                    <button
                      className="b2b-button b2b-button-primary"
                      type="submit"
                      disabled={enablingMfa || !mfaEnableCode.trim()}
                    >
                      {enablingMfa ? t.mfaEnabling : t.mfaEnableConfirm}
                    </button>
                    <button
                      className="b2b-button b2b-button-secondary"
                      type="button"
                      disabled={enablingMfa}
                      onClick={() => setMfaEnableOpen(false)}
                    >
                      {t.mfaEnableCancel}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <hr />
                <div className="settings-mfa-qr-wrap">
                  <span
                    className="skeleton-box"
                    style={{ width: 180, height: 180 }}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {passwordModalOpen ? (
        <div
          className="b2b-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !changingPassword) {
              setPasswordModalOpen(false);
            }
          }}
        >
          <section
            className="b2b-modal b2b-modal-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-change-title"
          >
            <button
              className="b2b-modal-close"
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              disabled={changingPassword}
              aria-label={t.changePasswordCancel}
            >
              ×
            </button>
            <h3 id="password-change-title">{t.changePasswordTitle}</h3>
            <hr />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleChangePassword();
              }}
            >
              <label className="drawer-field">
                <span>{t.currentPasswordLabel}</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={t.currentPasswordPlaceholder}
                  disabled={changingPassword}
                  autoFocus
                />
              </label>
              <label className="drawer-field">
                <span>{t.newPasswordLabel}</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t.newPasswordPlaceholder}
                  disabled={changingPassword}
                />
              </label>
              <div className="b2b-modal-actions">
                <button
                  className="b2b-button b2b-button-primary"
                  type="submit"
                  disabled={
                    changingPassword ||
                    !currentPassword.trim() ||
                    !newPassword.trim()
                  }
                >
                  {changingPassword
                    ? t.changingPassword
                    : t.changePasswordConfirm}
                </button>
                <button
                  className="b2b-button b2b-button-secondary"
                  type="button"
                  disabled={changingPassword}
                  onClick={() => setPasswordModalOpen(false)}
                >
                  {t.changePasswordCancel}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
