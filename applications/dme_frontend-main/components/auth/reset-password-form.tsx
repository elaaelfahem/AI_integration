'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ApiError, authApi } from '@/lib/api';
import { OtpCodeInput } from './otp-code-input';
import { PasswordRuleList } from './password-rule-list';
import { getPasswordRuleResults } from './password-rules';
import { Toast } from './toast';
import { WarningIcon } from './warning-icon';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

interface ResetPasswordFormProps {
  onBack: () => void;
  initialEmail?: string;
  lockedEmail?: boolean;
  forced?: boolean;
}

type ResetStep = 'request' | 'code' | 'password' | 'complete';

export function ResetPasswordForm({
  onBack,
  initialEmail = '',
  lockedEmail = false,
  forced = false,
}: ResetPasswordFormProps) {
  const { messages } = useI18n();
  const t = messages.resetPassword;
  const [step, setStep] = useState<ResetStep>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const ruleResults = useMemo(
    () => getPasswordRuleResults(password, messages.passwordRules),
    [password, messages.passwordRules],
  );
  const isPasswordValid = ruleResults.every((rule) => rule.isMet);
  const passwordsMatch = password === confirmPassword && confirmPassword !== '';

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setToast(null);
    setIsSubmitting(true);

    try {
      await authApi.requestPasswordReset({ email });
      setStep('code');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : t.errorRequestGeneric,
      );
      setToast({ message: t.toastRequestFailed });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setToast(null);

    if (!/^\d{6}$/.test(code)) {
      setError(t.errorCodeFormat);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await authApi.verifyPasswordResetCode({
        email,
        code,
      });
      setResetToken(response.resetToken);
      setStep('password');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : t.errorVerifyGeneric,
      );
      setToast({ message: t.toastVerifyFailed });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
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
      await authApi.confirmPasswordReset({
        resetToken,
        password,
        confirmPassword,
      });
      setStep('complete');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : t.errorConfirmGeneric,
      );
      setToast({ message: t.toastResetFailed });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'complete') {
    return (
      <div className="reset-password-form" role="status">
        <h1 className="form-heading">{t.headingComplete}</h1>
        <p className="form-intro">{t.introComplete}</p>
        <button className="primary-action" type="button" onClick={onBack}>
          {t.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <form
      className="reset-password-form"
      onSubmit={
        step === 'request'
          ? handleRequest
          : step === 'code'
            ? handleVerifyCode
            : handleConfirm
      }
      noValidate
    >
      {toast ? (
        <Toast
          variant="error"
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div>
        <h1 className="form-heading">
          {step === 'request'
            ? forced
              ? t.headingForced
              : t.headingRequest
            : step === 'code'
              ? t.headingCode
              : t.headingPassword}
        </h1>
        <p className="form-intro">
          {step === 'request'
            ? forced
              ? t.introForced
              : t.introRequest
            : step === 'code'
              ? interpolate(t.introCode, { email })
              : t.introPassword}
        </p>
      </div>

      {step !== 'password' && (!lockedEmail || step !== 'code') ? (
        <div className="field">
          <label htmlFor="reset-email">
            {t.emailLabel}
            <span className="required-mark">*</span>
          </label>
          <input
            id="reset-email"
            name="email"
            type="email"
            placeholder={messages.login.emailPlaceholder}
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            disabled={isSubmitting || step !== 'request' || lockedEmail}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      ) : null}

      {step === 'code' ? (
        <div className="field">
          <span id="reset-code-label">{t.codeLabel}</span>
          <OtpCodeInput
            length={6}
            value={code}
            onChange={setCode}
            disabled={isSubmitting}
            aria-label={t.codeAriaLabel}
          />
        </div>
      ) : null}

      {step === 'password' ? (
        <>
          <div className="field">
            <label htmlFor="reset-password">
              {t.newPasswordLabel}
              <span className="required-mark">*</span>
            </label>
            <div
              className={`password-field${
                error && !isPasswordValid ? ' password-field-error' : ''
              }`}
            >
              <input
                id="reset-password"
                name="password"
                type={isPasswordVisible ? 'text' : 'password'}
                placeholder={t.newPasswordLabel}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                disabled={isSubmitting}
                aria-describedby="password-rules reset-password-error"
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
            <label htmlFor="reset-confirm-password">
              {t.repeatPasswordLabel}
              <span className="required-mark">*</span>
            </label>
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder={t.repeatPasswordLabel}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirmPassword}
              disabled={isSubmitting}
              aria-describedby={error ? 'reset-password-error' : undefined}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </>
      ) : null}

      {error ? (
        <p className="field-error" id="reset-password-error" role="alert">
          <WarningIcon />
          {error}
        </p>
      ) : null}

      <div className="form-footer">
        <button
          className="link-action"
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
        >
          {t.backToLogin}
        </button>
        <button
          className="primary-action"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? messages.common.pleaseWait
            : step === 'request'
              ? t.sendCode
              : step === 'code'
                ? t.verifyCode
                : t.resetSubmit}
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
