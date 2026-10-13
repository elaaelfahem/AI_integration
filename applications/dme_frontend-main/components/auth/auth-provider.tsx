'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, authApi } from '@/lib/api';
import type {
  Account,
  AuthResponse,
  ForcedPasswordResetChallenge,
  LoginCredentials,
  MfaChallenge,
  MfaMethod,
  PasswordSetupChallenge,
  InvitationSetupChallenge,
  SetupPasswordResponse,
  TotpSetupResponse,
} from '@/types/auth';
import { useActivityMonitor } from '@/hooks/use-activity-monitor';
import {
  useSessionExpiry,
  type SessionTiming,
} from '@/hooks/use-session-expiry';
import { useI18n } from '@/lib/i18n/i18n-context';
import { clearCachedOwnProfile } from '@/lib/profile-cache';
import { Toast } from './toast';
import { fetchEmailWhitelist } from '@/lib/validation';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
type ToastState = { variant: 'success' | 'error'; message: string };

interface AuthContextValue {
  account: Account | null;
  status: AuthStatus;
  lastActive: string | null;
  sessionTiming: SessionTiming | null;
  mfaChallenge: MfaChallenge | null;
  passwordSetupChallenge: PasswordSetupChallenge | null;
  invitationSetupChallenge: InvitationSetupChallenge | null;
  forcedPasswordResetChallenge: ForcedPasswordResetChallenge | null;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  setupPassword: (
    password: string,
    confirmPassword: string,
  ) => Promise<SetupPasswordResponse>;
  verifyInvitation: (token: string, password: string) => Promise<void>;
  requestMfaCode: (method?: MfaMethod) => Promise<void>;
  verifyMfaCode: (code: string, method?: MfaMethod) => Promise<void>;
  setupTotp: () => Promise<TotpSetupResponse>;
  confirmTotp: (code: string) => Promise<void>;
  clearMfaChallenge: () => void;
  clearForcedPasswordResetChallenge: () => void;
  logout: () => Promise<void>;
  /** Saves the language to the account so emails and notifications follow it. */
  setAccountLanguage: (language: 'fr' | 'en') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCOUNT_STORAGE_KEY = 'dme_account';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { messages, locale, setLocale } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [lastActive, setLastActive] = useState<string | null>(null);
  const [sessionTiming, setSessionTiming] = useState<SessionTiming | null>(
    null,
  );
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [passwordSetupChallenge, setPasswordSetupChallenge] =
    useState<PasswordSetupChallenge | null>(null);
  const [invitationSetupChallenge, setInvitationSetupChallenge] =
    useState<InvitationSetupChallenge | null>(null);
  const [forcedPasswordResetChallenge, setForcedPasswordResetChallenge] =
    useState<ForcedPasswordResetChallenge | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const touchInFlight = useRef(false);

  const endSession = useCallback(() => {
    authApi.clear();
    sessionStorage.removeItem(ACCOUNT_STORAGE_KEY);
    clearCachedOwnProfile();
    setAccount(null);
    setLastActive(null);
    setSessionTiming(null);
    setPasswordSetupChallenge(null);
    setInvitationSetupChallenge(null);
    setForcedPasswordResetChallenge(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    void fetchEmailWhitelist();
    const storedAccount = sessionStorage.getItem(ACCOUNT_STORAGE_KEY);

    if (!storedAccount) {
      queueMicrotask(() => setStatus('anonymous'));
      return;
    }

    void authApi
      .restore()
      .then((session) => {
        setAccount(JSON.parse(storedAccount) as Account);
        setLastActive(session.lastActive);
        setSessionTiming(createSessionTiming(session));
        setStatus('authenticated');
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          endSession();
        } else {
          endSession();
          setToast({
            variant: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : messages.login.genericError,
          });
        }
      });
  }, [endSession, messages.login.genericError]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const response = await authApi.login(credentials);

      if ('passwordSetupRequired' in response) {
        setPasswordSetupChallenge(response);
        setMfaChallenge(null);
        setForcedPasswordResetChallenge(null);
        setStatus('anonymous');
        return response;
      }

      if ('passwordResetRequired' in response) {
        setForcedPasswordResetChallenge(response);
        setPasswordSetupChallenge(null);
        setMfaChallenge(null);
        setStatus('anonymous');
        return response;
      }

      if (response.mfaRequired) {
        setMfaChallenge(response);
        setPasswordSetupChallenge(null);
        setForcedPasswordResetChallenge(null);
        return response;
      }

      sessionStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify(response.account),
      );
      setMfaChallenge(null);
      setPasswordSetupChallenge(null);
      setForcedPasswordResetChallenge(null);
      setAccount(response.account);
      setLastActive(response.lastActive);
      setSessionTiming(createSessionTiming(response));
      setStatus('authenticated');
      setToast({ variant: 'success', message: messages.toast.loginSuccess });
      return response;
    },
    [messages],
  );

  const setupPassword = useCallback(
    async (password: string, confirmPassword: string) => {
      if (!passwordSetupChallenge) {
        throw new Error('There is no pending password setup to act on.');
      }

      const response = await authApi.setupPassword({
        setupToken: passwordSetupChallenge.setupToken,
        password,
        confirmPassword,
      });

      if (response.mfaRequired) {
        setPasswordSetupChallenge(null);
        setInvitationSetupChallenge(null);
        setForcedPasswordResetChallenge(null);
        setMfaChallenge(response);
        return response;
      }

      sessionStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify(response.account),
      );
      setPasswordSetupChallenge(null);
      setInvitationSetupChallenge(null);
      setForcedPasswordResetChallenge(null);
      setMfaChallenge(null);
      setAccount(response.account);
      setLastActive(response.lastActive);
      setSessionTiming(createSessionTiming(response));
      setStatus('authenticated');
      setToast({
        variant: 'success',
        message: messages.toast.passwordSetSuccess,
      });
      return response;
    },
    [passwordSetupChallenge, messages],
  );

  const verifyInvitation = useCallback(
    async (token: string, password: string) => {
      const response = await authApi.verifyInvitation(token, password);
      const challenge = { ...response, passwordSetupRequired: true as const };
      setInvitationSetupChallenge(challenge);
      setPasswordSetupChallenge(challenge);
      setMfaChallenge(null);
      setForcedPasswordResetChallenge(null);
      setStatus('anonymous');
    },
    [],
  );

  const requestMfaCode = useCallback(
    async (method?: MfaMethod) => {
      if (!mfaChallenge) {
        throw new Error('There is no pending verification to act on.');
      }

      await authApi.requestMfaCode(mfaChallenge.mfaToken, method);
    },
    [mfaChallenge],
  );

  const verifyMfaCode = useCallback(
    async (code: string, method?: MfaMethod) => {
      if (!mfaChallenge) {
        throw new Error('There is no pending verification to act on.');
      }

      const response = await authApi.verifyMfaCode(
        mfaChallenge.mfaToken,
        code,
        method,
      );
      sessionStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify(response.account),
      );
      setMfaChallenge(null);
      setAccount(response.account);
      setLastActive(response.lastActive);
      setSessionTiming(createSessionTiming(response));
      setStatus('authenticated');
      setToast({ variant: 'success', message: messages.toast.loginSuccess });
    },
    [mfaChallenge, messages],
  );

  const setupTotp = useCallback(async () => {
    if (!mfaChallenge) {
      throw new Error('There is no pending verification to act on.');
    }

    return authApi.setupTotp(mfaChallenge.mfaToken);
  }, [mfaChallenge]);

  const confirmTotp = useCallback(
    async (code: string) => {
      if (!mfaChallenge) {
        throw new Error('There is no pending verification to act on.');
      }

      const response = await authApi.confirmTotp(mfaChallenge.mfaToken, code);
      sessionStorage.setItem(
        ACCOUNT_STORAGE_KEY,
        JSON.stringify(response.account),
      );
      setMfaChallenge(null);
      setAccount(response.account);
      setLastActive(response.lastActive);
      setSessionTiming(createSessionTiming(response));
      setStatus('authenticated');
      setToast({ variant: 'success', message: messages.toast.loginSuccess });
    },
    [mfaChallenge, messages],
  );

  const clearMfaChallenge = useCallback(() => {
    setMfaChallenge(null);
  }, []);

  const clearForcedPasswordResetChallenge = useCallback(() => {
    setForcedPasswordResetChallenge(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      endSession();
      setToast({ variant: 'success', message: messages.toast.logoutSuccess });
    }
  }, [endSession, messages]);

  const touch = useCallback(async () => {
    touchInFlight.current = true;

    try {
      const response = await authApi.touch();
      setLastActive(response.lastActive);
      setSessionTiming(createSessionTiming(response));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endSession();
      }
    } finally {
      touchInFlight.current = false;
    }
  }, [endSession]);

  useActivityMonitor(
    status === 'authenticated',
    sessionTiming?.touchIntervalMs ?? null,
    touch,
  );
  useSessionExpiry(
    status === 'authenticated',
    sessionTiming,
    () => touchInFlight.current,
    endSession,
  );

  // The account language wins over the browser cookie: it follows the user
  // across devices and decides the language of their emails.
  const accountLanguage = account?.language;
  useEffect(() => {
    if (accountLanguage && accountLanguage !== locale) {
      setLocale(accountLanguage);
    }
    // Only when the account language changes (login, restore, switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLanguage]);

  const setAccountLanguage = useCallback(async (language: 'fr' | 'en') => {
    setAccount((current) => {
      if (!current) return current;
      const next = { ...current, language };
      sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    await authApi.updateLanguage(language).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      account,
      setAccountLanguage,
      status,
      lastActive,
      sessionTiming,
      mfaChallenge,
      passwordSetupChallenge,
      invitationSetupChallenge,
      forcedPasswordResetChallenge,
      login,
      setupPassword,
      verifyInvitation,
      requestMfaCode,
      verifyMfaCode,
      setupTotp,
      confirmTotp,
      clearMfaChallenge,
      clearForcedPasswordResetChallenge,
      logout,
    }),
    [
      account,
      status,
      lastActive,
      sessionTiming,
      mfaChallenge,
      passwordSetupChallenge,
      invitationSetupChallenge,
      forcedPasswordResetChallenge,
      login,
      setupPassword,
      verifyInvitation,
      requestMfaCode,
      verifyMfaCode,
      setupTotp,
      confirmTotp,
      clearMfaChallenge,
      clearForcedPasswordResetChallenge,
      logout,
      setAccountLanguage,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </AuthContext.Provider>
  );
}

function createSessionTiming(response: {
  idleExpiresInMs: number;
  touchIntervalMs: number;
}): SessionTiming {
  return {
    idleExpiresInMs: response.idleExpiresInMs,
    touchIntervalMs: response.touchIntervalMs,
    synchronizedAt: performance.now(),
  };
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
