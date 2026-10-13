'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authApi } from '@/lib/api';
import { DEBUG_SKELETON } from '@/lib/skeleton';
import type { ManagedUser } from '@/types/auth';
import { StatusPill } from '@/components/user-management/status-pill';
import {
  ConnectionHistory,
  ProfileField,
  TeamOverview,
  TeamOverviewSkeleton,
  formatLastConnection,
} from './profile-shared';
import { useI18n } from '@/lib/i18n/i18n-context';
import { getCachedOwnProfile, setCachedOwnProfile } from '@/lib/profile-cache';

export function MyProfile() {
  const router = useRouter();
  const { messages, locale } = useI18n();
  const [user, setUser] = useState<ManagedUser | null>(getCachedOwnProfile);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void authApi
      .getOwnProfile()
      .then((profile) => {
        setCachedOwnProfile(profile);
        setUser(profile);
      })
      .catch(() => {
        if (!getCachedOwnProfile())
          setError(messages.profile.errorOwnUnavailable);
      });
  }, [messages]);

  if (error)
    return (
      <section className="profile-error" role="alert">
        {error}
        <button type="button" onClick={() => router.back()}>
          {messages.profile.back}
        </button>
      </section>
    );
  if (!user || DEBUG_SKELETON) return <MyProfileSkeleton />;

  return (
    <section className="user-profile-page" aria-labelledby="profile-title">
      <div className="profile-heading">
        <h1 id="profile-title">
          <strong>{messages.profile.pageTitleMyStrong}</strong>
          {messages.profile.pageTitleMyRest}
        </h1>
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
            <StatusPill value={user.role} />
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
                label={messages.profile.memberSince}
                value={formatDate(user.createdAt, locale)}
              />
            </section>
          </div>
          <ConnectionHistory />
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
    </section>
  );
}

function MyProfileSkeleton() {
  const { messages } = useI18n();
  return (
    <section className="user-profile-page" aria-labelledby="profile-title-skel">
      <div className="profile-heading">
        <h1 id="profile-title-skel">
          <strong>{messages.profile.pageTitleMyStrong}</strong>
          {messages.profile.pageTitleMyRest}
        </h1>
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
          </div>
          <p className="profile-email">
            <span className="skeleton-box" style={{ width: 180, height: 16 }} />
          </p>
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
                <small>{messages.profile.memberSince}</small>
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

function formatDate(timestamp: string, locale: string): string {
  return new Date(timestamp).toLocaleDateString(
    locale === 'en' ? 'en-US' : 'fr-FR',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  );
}
