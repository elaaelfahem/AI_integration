export const ACCESS_TOKEN_TTL_SECONDS = 5 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_TOKEN_GRACE_MS = 10 * 1000;
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const ACCOUNT_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DELETED: 'DELETED',
} as const;

export const MFA_CHALLENGE_TTL_SECONDS = 2 * 60;
export const MFA_CODE_TTL_SECONDS = 5 * 60;
export const MFA_CODE_LENGTH = 6;
export const PASSWORD_SETUP_TTL_SECONDS = 10 * 60;
export const PASSWORD_RESET_CODE_TTL_SECONDS = 15 * 60;
export const PASSWORD_RESET_CODE_LENGTH = 6;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_VERIFICATION_TTL_SECONDS = 10 * 60;
export const INVITATION_TOKEN_TTL_SECONDS = 15 * 60;
export const INVITATION_MAX_ATTEMPTS = 3;
export const INVITATION_PASSWORD_LENGTH = 24;
export const PASSWORD_RESET_EMAIL_LIMIT_CONFIG = {
  limit: {
    environmentKey: 'PASSWORD_RESET_EMAIL_LIMIT',
    defaultValue: 3,
  },
  window: {
    environmentKey: 'PASSWORD_RESET_EMAIL_WINDOW_MS',
    defaultMs: 15 * 60 * 1000,
  },
} as const;

export const TOTP_ISSUER = 'Orange DME';

export const AUTH_TIMING_CONFIG = {
  sessionIdleTimeout: {
    environmentKey: 'SESSION_IDLE_TIMEOUT_MS',
    defaultMs: 15 * 60 * 1000,
  },
  touchInterval: {
    environmentKey: 'TOUCH_INTERVAL_MS',
    defaultMs: 60 * 1000,
  },
} as const;
