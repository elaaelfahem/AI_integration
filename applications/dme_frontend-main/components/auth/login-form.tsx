'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useAuth } from './auth-provider';
import { ResetPasswordForm } from './reset-password-form';
import { Toast } from './toast';
import { WarningIcon } from './warning-icon';
import { useI18n } from '@/lib/i18n/i18n-context';
import {
  fetchEmailWhitelist,
  isEmailDomainAllowed,
  getEmailDomainWhitelistErrorMessage,
} from '@/lib/validation';

export function LoginForm() {
  const {
    clearForcedPasswordResetChallenge,
    forcedPasswordResetChallenge,
    login,
  } = useAuth();
  const router = useRouter();
  const { messages } = useI18n();
  const t = messages.login;
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setToast(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim().toLowerCase();
    const password = String(form.get('password'));

    const activeWhitelist = await fetchEmailWhitelist();
    if (!isEmailDomainAllowed(email, activeWhitelist)) {
      setError(
        getEmailDomainWhitelistErrorMessage(
          activeWhitelist,
          messages.userManagement.emailDomainNotAllowed,
        ),
      );
      setToast({ message: t.toastDomainNotAllowed });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await login({
        email,
        password,
      });

      if ('mfaRequired' in response && response.mfaRequired) {
        router.push('/otp');
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : t.genericError,
      );
      setToast({ message: t.toastError });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (forcedPasswordResetChallenge) {
    return (
      <ResetPasswordForm
        initialEmail={forcedPasswordResetChallenge.email}
        lockedEmail
        forced
        onBack={clearForcedPasswordResetChallenge}
      />
    );
  }

  if (isResettingPassword) {
    return <ResetPasswordForm onBack={() => setIsResettingPassword(false)} />;
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      {toast ? (
        <Toast
          variant="error"
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <h1 className="form-heading">{t.heading}</h1>

      <div className="field">
        <label htmlFor="email">
          {t.emailLabel}
          <span className="required-mark">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder={t.emailPlaceholder}
          autoComplete="username"
          inputMode="email"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="field">
        <label htmlFor="password">
          {t.passwordLabel}
          <span className="required-mark">*</span>
        </label>
        <div
          className={`password-field${error ? ' password-field-error' : ''}`}
        >
          <input
            id="password"
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            placeholder={t.passwordPlaceholder}
            autoComplete="current-password"
            minLength={8}
            required
            disabled={isSubmitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'password-error' : undefined}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            aria-label={isPasswordVisible ? t.hidePassword : t.showPassword}
            aria-pressed={isPasswordVisible}
            disabled={isSubmitting}
          >
            {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error ? (
          <p className="field-error" id="password-error" role="alert">
            <WarningIcon />
            {error}
          </p>
        ) : null}
      </div>

      <div className="form-footer">
        <button
          className="forgot-password"
          type="button"
          onClick={() => setIsResettingPassword(true)}
          disabled={isSubmitting}
        >
          {t.forgotPassword}
        </button>

        <button
          className="primary-action"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? t.submitting : t.submit}
        </button>
      </div>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A11 11 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.1 3.9M6.1 6.1A13.2 13.2 0 0 0 1 12s4 7 11 7a11 11 0 0 0 3.1-.45"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
