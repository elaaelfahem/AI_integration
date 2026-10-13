'use client';

import { useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { Ticket, TicketPriority, TicketType } from '@/types/auth';
import {
  TICKET_PRIORITIES,
  TICKET_TYPES,
  ticketPriorityLabel,
  ticketTypeLabel,
} from './ticket-shared';

export function TicketForm({
  onCancel,
  onCreated,
}: {
  onCancel?: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const { messages } = useI18n();
  const t = messages.ticketsPage;
  const [type, setType] = useState<TicketType | ''>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) {
      setError(t.formFieldTypePlaceholder);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const ticket = await authApi.createTicket({
        type,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        ...(attachment && { attachment }),
      });
      onCreated(ticket);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorCreateFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ticket-form-card">
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="drawer-field">
          <span>
            {t.formFieldType} <b>*</b>
          </span>
          <select
            required
            value={type}
            onChange={(event) => setType(event.target.value as TicketType)}
            disabled={saving}
          >
            <option value="">{t.formFieldTypePlaceholder}</option>
            {TICKET_TYPES.map((option) => (
              <option key={option} value={option}>
                {ticketTypeLabel(option, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="drawer-field">
          <span>
            {t.formFieldSubject} <b>*</b>
          </span>
          <input
            required
            type="text"
            maxLength={160}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t.formFieldSubjectPlaceholder}
            disabled={saving}
          />
        </label>
        <label className="drawer-field">
          <span>
            {t.formFieldDescription} <b>*</b>
          </span>
          <textarea
            required
            rows={4}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.formFieldDescriptionPlaceholder}
            disabled={saving}
          />
        </label>
        <div className="drawer-field">
          <span>{t.formFieldPriority}</span>
          <div className="ticket-priority-choice">
            {TICKET_PRIORITIES.map((option) => (
              <button
                key={option}
                type="button"
                className={option === priority ? 'active' : undefined}
                disabled={saving}
                onClick={() => setPriority(option)}
              >
                {ticketPriorityLabel(option, t)}
              </button>
            ))}
          </div>
        </div>
        <div className="drawer-field">
          <span>{t.formFieldAttachment}</span>
          <div
            className="ticket-attachment-drop"
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ')
                fileInputRef.current?.click();
            }}
          >
            <Image
              className="ticket-attachment-icon"
              src="/tickets/upload-cloud.svg"
              alt=""
              width={28}
              height={28}
              aria-hidden="true"
            />
            <p className="ticket-attachment-hint">{t.formAttachmentHint}</p>
            <p className="ticket-attachment-formats">
              {attachment ? attachment.name : t.formAttachmentFormats}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              style={{ display: 'none' }}
              disabled={saving}
              onChange={(event) =>
                setAttachment(event.target.files?.[0] ?? null)
              }
            />
          </div>
        </div>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="drawer-actions ticket-form-actions">
          {onCancel ? (
            <button
              className="outline-button"
              type="button"
              onClick={onCancel}
              disabled={saving}
            >
              {t.formCancel}
            </button>
          ) : null}
          <button className="orange-button" type="submit" disabled={saving}>
            {saving ? t.formSubmitting : t.formSubmit}
          </button>
        </div>
      </form>
    </section>
  );
}
