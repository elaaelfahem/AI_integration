'use client';

import type { FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import {
  isEmailDomainAllowed,
  getEmailDomainWhitelistErrorMessage,
} from '@/lib/validation';

export function InviteManagerForm({
  email,
  firstName,
  lastName,
  isSending,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
  onSubmit,
}: {
  email: string;
  firstName: string;
  lastName: string;
  isSending: boolean;
  onEmailChange: (value: string) => void;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { messages } = useI18n();
  const t = messages.userManagement;
  const canSubmit = Boolean(
    email.trim() &&
    firstName.trim() &&
    lastName.trim() &&
    isEmailDomainAllowed(email),
  );

  return (
    <form className="b2b-invite-form" onSubmit={onSubmit} noValidate>
      <div className="b2b-field">
        <label htmlFor="manager-email">{t.drawerEmailLabel}</label>
        <input
          id="manager-email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          required
          disabled={isSending}
          placeholder="manager@orange.com"
          style={
            email.trim() && !isEmailDomainAllowed(email)
              ? { borderColor: '#e63946', backgroundColor: '#fff8f8' }
              : undefined
          }
        />
        {email.trim() && !isEmailDomainAllowed(email) && (
          <span
            style={{
              color: '#e63946',
              fontSize: '0.82rem',
              marginTop: '0.25rem',
              display: 'block',
            }}
          >
            {getEmailDomainWhitelistErrorMessage(
              undefined,
              messages.userManagement.emailDomainNotAllowed,
            )}
          </span>
        )}
      </div>
      <div className="b2b-field">
        <label htmlFor="manager-first-name">
          {t.drawerFirstNamePlaceholder}
        </label>
        <input
          id="manager-first-name"
          value={firstName}
          onChange={(event) => onFirstNameChange(event.target.value)}
          required
          disabled={isSending}
        />
      </div>
      <div className="b2b-field">
        <label htmlFor="manager-last-name">{t.drawerLastNamePlaceholder}</label>
        <input
          id="manager-last-name"
          value={lastName}
          onChange={(event) => onLastNameChange(event.target.value)}
          required
          disabled={isSending}
        />
      </div>
      <button
        className="b2b-button b2b-button-primary"
        type="submit"
        disabled={isSending || !canSubmit}
      >
        {isSending ? t.drawerSubmitting : t.drawerSubmit}
      </button>
    </form>
  );
}
