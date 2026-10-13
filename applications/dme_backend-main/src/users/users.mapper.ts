import { SuperadminStatus, UserRole, UserStatus } from '@prisma/client';
import { USER_ONLINE_THRESHOLD_MS } from './users.constants';
import {
  EMAIL_PREFERENCE_KEYS,
  type EmailPreferenceKey,
} from '../notifications/notification.types';

type SessionSnapshot = { last_active: Date };

type ManagerSnapshot = { first_name: string; last_name: string };

type UserSnapshot = {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string | null;
  latest_login: Date | null;
  created_at: Date;
  password_reset_required: boolean;
  status: UserStatus;
  account?: { id: string; sessions: SessionSnapshot[] } | null;
  manager?: ManagerSnapshot | null;
  mfa_type?: string | null;
  avatar_mime?: string | null;
  notify_analysis_results?: boolean;
  notify_work_updates?: boolean;
  locale?: string;
  email_opt_outs?: string[];
};

type SuperadminSnapshot = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  latest_login: Date | null;
  created_at: Date;
  status: SuperadminStatus;
  account?: { id: string; sessions: SessionSnapshot[] } | null;
  mfa_type?: string | null;
  avatar_mime?: string | null;
  notify_analysis_results?: boolean;
  notify_work_updates?: boolean;
  locale?: string;
  email_opt_outs?: string[];
};

export type ManagedUserView = {
  id: string;
  accountId?: string;
  email: string;
  role: UserRole | 'ADMIN';
  firstName: string;
  lastName: string;
  phone: string | null;
  latestLogin: string | null;
  lastActive: string | null;
  isOnline: boolean;
  createdAt: string;
  passwordResetRequired: boolean;
  status: UserStatus | SuperadminStatus;
  managerName: string | null;
  mfaMethod: string | null;
  hasAvatar: boolean;
  notifyAnalysisResults: boolean;
  notifyWorkUpdates: boolean;
  /** Language of the interface, emails and notifications. */
  language: 'fr' | 'en';
  emailPreferences: Record<EmailPreferenceKey, boolean>;
};

function getActivity(
  session: SessionSnapshot | undefined,
  latestLogin: Date | null,
) {
  const lastActive = session?.last_active ?? latestLogin;
  return {
    lastActive,
    isOnline:
      session !== undefined &&
      Date.now() - session.last_active.getTime() <= USER_ONLINE_THRESHOLD_MS,
  };
}

export function mapUserView(user: UserSnapshot): ManagedUserView {
  const session = user.account?.sessions[0];
  const activity = getActivity(session, user.latest_login);

  return {
    id: user.id,
    accountId: user.account?.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    latestLogin: user.latest_login?.toISOString() ?? null,
    lastActive: activity.lastActive?.toISOString() ?? null,
    isOnline: activity.isOnline,
    createdAt: user.created_at.toISOString(),
    passwordResetRequired: user.password_reset_required,
    status: user.status,
    managerName: user.manager
      ? `${user.manager.first_name} ${user.manager.last_name}`
      : null,
    mfaMethod: user.mfa_type ?? null,
    hasAvatar: !!user.avatar_mime,
    notifyAnalysisResults: user.notify_analysis_results ?? true,
    notifyWorkUpdates: user.notify_work_updates ?? true,
    language: user.locale === 'en' ? 'en' : 'fr',
    emailPreferences: emailPreferencesView(user.email_opt_outs),
  };
}

export function mapSuperadminView(
  superadmin: SuperadminSnapshot,
): ManagedUserView {
  const session = superadmin.account?.sessions[0];
  const activity = getActivity(session, superadmin.latest_login);

  return {
    id: superadmin.id,
    accountId: superadmin.account?.id,
    email: superadmin.email,
    role: 'ADMIN',
    firstName: superadmin.first_name,
    lastName: superadmin.last_name,
    phone: superadmin.phone,
    latestLogin: superadmin.latest_login?.toISOString() ?? null,
    lastActive: activity.lastActive?.toISOString() ?? null,
    isOnline: activity.isOnline,
    createdAt: superadmin.created_at.toISOString(),
    passwordResetRequired: false,
    status: superadmin.status,
    managerName: null,
    mfaMethod: superadmin.mfa_type ?? null,
    hasAvatar: !!superadmin.avatar_mime,
    notifyAnalysisResults: superadmin.notify_analysis_results ?? true,
    notifyWorkUpdates: superadmin.notify_work_updates ?? true,
    language: superadmin.locale === 'en' ? 'en' : 'fr',
    emailPreferences: emailPreferencesView(superadmin.email_opt_outs),
  };
}

function emailPreferencesView(optOuts: readonly string[] = []) {
  return Object.fromEntries(
    EMAIL_PREFERENCE_KEYS.map((key) => [key, !optOuts.includes(key)]),
  ) as Record<EmailPreferenceKey, boolean>;
}
