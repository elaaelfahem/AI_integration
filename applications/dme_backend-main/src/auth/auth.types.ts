import type { UserRole } from '@prisma/client';

export const APP_ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  MANAGER: 'MANAGER',
  AGENT: 'AGENT',
} as const;

export type AppRole = (typeof APP_ROLES)['SUPERADMIN'] | UserRole;

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  role: AppRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  jti: string;
  type: 'refresh';
}

export type MfaMethod = 'EMAIL' | 'SMS' | 'AUTH';

export interface MfaChallengePayload {
  sub: string;
  type: 'mfa_challenge';
}

export interface PasswordSetupPayload {
  sub: string;
  inviteId?: string;
  type: 'password_setup';
}

export interface PasswordResetPayload {
  sub: string;
  resetCodeId: string;
  type: 'password_reset';
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}
