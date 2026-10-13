'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getJwtExpiryMs } from '@/lib/jwt';
import { interpolate } from '@/lib/i18n/messages';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { MfaMethod, TotpSetupResponse } from '@/types/auth';
import { useAuth } from './auth-provider';
import { OtpCodeInput } from './otp-code-input';
import { WarningIcon } from './warning-icon';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

type OtpStep = 'select-method' | 'sending' | 'totp-setup' | 'enter-code';

export function OtpForm() {
  const {
    mfaChallenge,
    requestMfaCode,
    verifyMfaCode,
    setupTotp,
    confirmTotp,
    clearMfaChallenge,
  } = useAuth();
  const { messages } = useI18n();
  const router = useRouter();

  const OTP_METHODS: {
    value: MfaMethod;
    label: string;
    description: string;
    icon: ReactElement;
  }[] = [
    {
      value: 'SMS',
      label: messages.otp.methods.sms.label,
      description: messages.otp.methods.sms.description,
      icon: <PhoneIcon />,
    },
    {
      value: 'EMAIL',
      label: messages.otp.methods.email.label,
      description: messages.otp.methods.email.description,
      icon: <MailIcon />,
    },
    {
      value: 'AUTH',
      label: messages.otp.methods.auth.label,
      description: messages.otp.methods.auth.description,
      icon: <ShieldIcon />,
    },
  ];

  const METHOD_TITLES: Record<MfaMethod, string> = {
    SMS: messages.otp.methodTitles.sms,
    EMAIL: messages.otp.methodTitles.email,
    AUTH: messages.otp.methodTitles.auth,
  };
  const [step, setStep] = useState<OtpStep>(() =>
    mfaChallenge?.mfaType === 'AUTH' ? 'enter-code' : 'select-method',
  );
  const [method, setMethod] = useState<MfaMethod | null>(
    () => mfaChallenge?.mfaType ?? null,
  );
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const hasAutoSent = useRef(false);

  useEffect(() => {
    if (!mfaChallenge) {
      router.replace('/login');
      return;
    }

    if (
      hasAutoSent.current ||
      !mfaChallenge.mfaType ||
      mfaChallenge.mfaType === 'AUTH'
    ) {
      return;
    }
    hasAutoSent.current = true;

    setStep('sending');
    requestMfaCode()
      .then(() => {
        setStep('enter-code');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      })
      .catch((requestError: unknown) => {
        setStep('select-method');
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : messages.otp.errorSendFailed,
        );
      });
  }, [mfaChallenge, requestMfaCode, router, messages]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resendCooldown]);

  useEffect(() => {
    const token = mfaChallenge?.mfaToken;
    if (!token) {
      return;
    }

    const expiryMs = getJwtExpiryMs(token);
    if (!expiryMs) {
      return;
    }

    const expireNow = () => {
      clearMfaChallenge();
      router.replace('/login');
    };

    const remainingMs = expiryMs - Date.now();
    if (remainingMs <= 0) {
      expireNow();
      return;
    }

    const timeout = window.setTimeout(expireNow, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [mfaChallenge?.mfaToken, clearMfaChallenge, router]);

  async function handleContinue() {
    if (!method) {
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      if (method === 'AUTH') {
        const setup = await setupTotp();
        setTotpSetup(setup);
        setStep('totp-setup');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        await requestMfaCode(method);
        setStep('enter-code');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorContinueFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUseCurrentMethod() {
    const currentMethod = mfaChallenge?.mfaType;
    if (!currentMethod) {
      return;
    }

    setMethod(currentMethod);
    setError('');

    if (currentMethod === 'AUTH') {
      setStep('enter-code');
      return;
    }

    setIsSubmitting(true);

    try {
      await requestMfaCode(currentMethod);
      setStep('enter-code');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorSendFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendTotp() {
    setError('');
    setIsSubmitting(true);

    try {
      const setup = await setupTotp();
      setTotpSetup(setup);
      setCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorResendTotpFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError('');
    setIsSubmitting(true);

    try {
      await requestMfaCode(method ?? undefined);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorResendFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await verifyMfaCode(code, method ?? undefined);
      router.push('/dashboard');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorVerifyFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await confirmTotp(code);
      router.push('/dashboard');
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : messages.otp.errorVerifyFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'sending') {
    return (
      <div className="otp-form">
        <div>
          <h1>{messages.otp.sendingHeading}</h1>
          <p className="form-intro">{messages.otp.sendingSubtitle}</p>
        </div>
      </div>
    );
  }

  if (step === 'select-method') {
    const availableMethods = OTP_METHODS.filter(
      (option) => option.value !== mfaChallenge?.mfaType,
    );

    return (
      <div className="otp-form">
        <div className="otp-method-list-intro">
          <h1 className="otp-heading">{messages.otp.selectMethodHeading}</h1>
          <p className="otp-subtitle">{messages.otp.selectMethodSubtitle}</p>
        </div>

        {error ? (
          <p className="field-error" role="alert">
            <WarningIcon />
            {error}
          </p>
        ) : null}

        <div
          className="otp-method-list"
          role="radiogroup"
          aria-label={messages.otp.methodGroupLabel}
        >
          {availableMethods.map((option) => (
            <label
              key={option.value}
              className={`otp-method-card${
                method === option.value ? ' otp-method-card-selected' : ''
              }`}
            >
              <span className="otp-method-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span className="otp-method-body">
                <span className="otp-method-title">{option.label}</span>
                <span className="otp-method-description">
                  {option.description}
                </span>
              </span>
              <input
                type="radio"
                name="otp-method"
                className="otp-method-radio"
                value={option.value}
                checked={method === option.value}
                onChange={() => setMethod(option.value)}
                disabled={isSubmitting}
              />
            </label>
          ))}
        </div>

        <button
          className="primary-action"
          type="button"
          onClick={() => void handleContinue()}
          disabled={!method || isSubmitting}
        >
          {isSubmitting
            ? messages.common.pleaseWait
            : messages.otp.continueAction}
        </button>

        {mfaChallenge?.mfaType ? (
          <button
            className="link-action"
            type="button"
            onClick={() => void handleUseCurrentMethod()}
            disabled={isSubmitting}
          >
            {messages.otp.backToCurrentMethod}
          </button>
        ) : null}
      </div>
    );
  }

  if (step === 'totp-setup' && totpSetup) {
    return (
      <form className="otp-form" onSubmit={handleConfirmTotp} noValidate>
        <div>
          <h1 className="otp-heading">
            {METHOD_TITLES.AUTH}
            <span className="required-mark">*</span>
          </h1>
          <p className="otp-subtitle">{messages.otp.totpSubtitle}</p>
        </div>

        {error ? (
          <p className="field-error" role="alert">
            <WarningIcon />
            {error}
          </p>
        ) : null}

        <Image
          className="totp-qr"
          src={totpSetup.qrCodeDataUrl}
          alt={messages.otp.qrAlt}
          width={200}
          height={200}
          unoptimized
        />

        <div className="field">
          <span id="code-label">{messages.otp.codeLabel}</span>
          <OtpCodeInput
            length={CODE_LENGTH}
            value={code}
            onChange={setCode}
            disabled={isSubmitting}
            aria-label={messages.otp.codeLabel}
          />
        </div>

        <div className="otp-resend">
          <span className="otp-resend-prompt">
            {messages.otp.noCodeReceived}
          </span>
          <button
            className="otp-resend-action"
            type="button"
            onClick={() => void handleResendTotp()}
            disabled={isSubmitting || resendCooldown > 0}
          >
            {messages.otp.resend}
            {resendCooldown > 0 ? (
              <span className="otp-resend-timer">({resendCooldown}s)</span>
            ) : null}
          </button>
        </div>

        <button
          className="primary-action"
          type="submit"
          disabled={isSubmitting || code.length < CODE_LENGTH}
        >
          {isSubmitting ? messages.otp.verifying : messages.otp.verify}
        </button>

        <button
          className="link-action"
          type="button"
          onClick={() => {
            setCode('');
            setError('');
            setTotpSetup(null);
            setMethod(null);
            setStep('select-method');
          }}
          disabled={isSubmitting}
        >
          {messages.otp.useAnotherMethod}
        </button>
      </form>
    );
  }

  return (
    <form className="otp-form" onSubmit={handleVerify} noValidate>
      <div>
        <h1 className="otp-heading">
          {method ? METHOD_TITLES[method] : messages.otp.defaultTitle}
          <span className="required-mark">*</span>
        </h1>
        <p className="otp-subtitle">
          {method === 'AUTH'
            ? messages.otp.authSubtitle
            : method === 'SMS' && mfaChallenge?.phone
              ? interpolate(messages.otp.smsSubtitle, {
                  phone: mfaChallenge.phone,
                })
              : interpolate(messages.otp.emailSubtitle, {
                  email: mfaChallenge?.email ?? '',
                })}
        </p>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          <WarningIcon />
          {error}
        </p>
      ) : null}

      <div className="field">
        <span id="code-label">{messages.otp.codeLabel}</span>
        <OtpCodeInput
          length={CODE_LENGTH}
          value={code}
          onChange={setCode}
          disabled={isSubmitting}
          aria-label={messages.otp.codeLabel}
        />
      </div>

      {method !== 'AUTH' ? (
        <div className="otp-resend">
          <span className="otp-resend-prompt">
            {messages.otp.noCodeReceived}
          </span>
          <button
            className="otp-resend-action"
            type="button"
            onClick={() => void handleResend()}
            disabled={isSubmitting || resendCooldown > 0}
          >
            {messages.otp.resend}
            {resendCooldown > 0 ? (
              <span className="otp-resend-timer">({resendCooldown}s)</span>
            ) : null}
          </button>
        </div>
      ) : null}

      <button
        className="primary-action"
        type="submit"
        disabled={isSubmitting || code.length < CODE_LENGTH}
      >
        {isSubmitting ? messages.otp.verifying : messages.otp.verify}
      </button>

      <button
        className="link-action"
        type="button"
        onClick={() => {
          setCode('');
          setError('');
          setMethod(null);
          setStep('select-method');
        }}
        disabled={isSubmitting}
      >
        {messages.otp.useAnotherMethod}
      </button>
    </form>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="6"
        y="2"
        width="12"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line
        x1="11"
        y1="18"
        x2="13"
        y2="18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m3 6 9 7 9-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 12 2.5 2.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
