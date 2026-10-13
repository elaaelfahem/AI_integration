'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { interpolate } from '@/lib/i18n/messages';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from './auth-provider';
import { Toast } from './toast';
import { WarningIcon } from './warning-icon';
import { PasswordRuleList } from './password-rule-list';
import { getPasswordRuleResults } from './password-rules';

export function SetupPasswordForm() {
  const { passwordSetupChallenge, setupPassword } = useAuth();
  const { messages } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const ruleResults = useMemo(
    () => getPasswordRuleResults(password, messages.passwordRules),
    [password, messages],
  );

  const isPasswordValid = ruleResults.every((rule) => rule.isMet);
  const passwordsMatch = password === confirmPassword && confirmPassword !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setToast(null);

    if (!isPasswordValid) {
      setError(messages.common.password.rulesNotMet);
      return;
    }

    if (!passwordsMatch) {
      setError(messages.common.password.mismatch);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await setupPassword(password, confirmPassword);

      if (response.mfaRequired) {
        router.push('/otp');
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.setupPassword.errorGeneric,
      );
      setToast({ message: messages.setupPassword.toastError });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="setup-password-form" onSubmit={handleSubmit} noValidate>
      {toast ? (
        <Toast
          variant="error"
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div>
        <h1 className="form-heading">{messages.setupPassword.formHeading}</h1>
        <p className="form-intro">
          {passwordSetupChallenge
            ? interpolate(messages.setupPassword.introWithName, {
                firstName: passwordSetupChallenge.firstName,
                email: passwordSetupChallenge.email,
              })
            : messages.setupPassword.introDefault}
        </p>
      </div>

      <div className="field">
        <label htmlFor="new-password">
          {messages.setupPassword.newPasswordLabel}
          <span className="required-mark">*</span>
        </label>
        <div
          className={`password-field${
            error && !isPasswordValid ? ' password-field-error' : ''
          }`}
        >
          <input
            id="new-password"
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            placeholder={messages.setupPassword.newPasswordPlaceholder}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            disabled={isSubmitting}
            aria-invalid={error && !isPasswordValid ? true : undefined}
            aria-describedby="password-rules setup-password-error"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            aria-label={
              isPasswordVisible
                ? messages.login.hidePassword
                : messages.login.showPassword
            }
            aria-pressed={isPasswordVisible}
            disabled={isSubmitting}
          >
            {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <PasswordRuleList rules={ruleResults} />
      </div>

      <div className="field">
        <label htmlFor="confirm-password">
          {messages.setupPassword.repeatPasswordLabel}
          <span className="required-mark">*</span>
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type={isPasswordVisible ? 'text' : 'password'}
          placeholder={messages.setupPassword.repeatPasswordPlaceholder}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={confirmPassword}
          disabled={isSubmitting}
          aria-invalid={error && !passwordsMatch ? true : undefined}
          aria-describedby={error ? 'setup-password-error' : undefined}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p className="field-error" id="setup-password-error" role="alert">
          <WarningIcon />
          {error}
        </p>
      ) : null}

      <button className="primary-action" type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? messages.setupPassword.submitting
          : messages.setupPassword.submit}
      </button>
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
