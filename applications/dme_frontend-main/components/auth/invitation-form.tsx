'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiError, authApi } from '@/lib/api';
import type { InvitationCheckResponse } from '@/types/auth';
import { useAuth } from './auth-provider';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

type InvitationState =
  | { token: string; status: 'checking'; invitation: null; error: null }
  | {
      token: string;
      status: 'valid';
      invitation: InvitationCheckResponse;
      error: null;
    }
  | { token: string; status: 'invalid'; invitation: null; error: string };

export function InvitationForm({ token }: { token: string }) {
  const { verifyInvitation } = useAuth();
  const t = useI18n().messages.invitation;
  const [invitationState, setInvitationState] = useState<InvitationState>({
    token,
    status: 'checking',
    invitation: null,
    error: null,
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const strippedPassword = useMemo(() => password.trim(), [password]);
  const isCheckingToken =
    invitationState.token !== token || invitationState.status === 'checking';
  const invitation =
    invitationState.token === token && invitationState.status === 'valid'
      ? invitationState.invitation
      : null;
  const invitationError =
    invitationState.token === token && invitationState.status === 'invalid'
      ? invitationState.error
      : null;

  useEffect(() => {
    let isCurrent = true;

    void authApi
      .checkInvitation(token)
      .then((response) => {
        if (isCurrent) {
          setInvitationState({
            token,
            status: 'valid',
            invitation: response,
            error: null,
          });
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setInvitationState({
            token,
            status: 'invalid',
            invitation: null,
            error: reason instanceof ApiError ? reason.message : t.linkError,
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [token, t.linkError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!invitation || strippedPassword.length === 0) {
      return;
    }

    setError(null);
    setPassword(strippedPassword);
    setIsSubmitting(true);

    try {
      await verifyInvitation(token, strippedPassword);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t.verifyError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingToken) {
    return (
      <div className="login-form" role="status">
        <div>
          <h1 className="form-heading">{t.checkingTitle}</h1>
          <p className="form-intro">{t.checkingIntro}</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="login-form">
        <div>
          <h1 className="form-heading">{t.unavailableTitle}</h1>
          <p className="form-intro">{t.unavailableIntro}</p>
        </div>
        {invitationError ? (
          <p className="field-error" role="alert">
            {invitationError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div>
        <h1 className="form-heading">{t.acceptTitle}</h1>
        <p className="form-intro">
          {interpolate(t.confirmedIntro, {
            name: invitation.firstName,
            email: invitation.email,
          })}
        </p>
      </div>
      <div className="field">
        <label htmlFor="invitation-password">{t.temporaryPassword}</label>
        <input
          id="invitation-password"
          type="password"
          value={password}
          onBlur={() => setPassword(strippedPassword)}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="one-time-code"
          required
          disabled={isSubmitting}
        />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="primary-action"
        type="submit"
        disabled={isSubmitting || strippedPassword.length === 0}
      >
        {isSubmitting ? t.checking : t.continue}
      </button>
    </form>
  );
}
