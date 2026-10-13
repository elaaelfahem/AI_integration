'use client';

import { useState, type FormEvent } from 'react';
import {
  DatePickerField,
  TimePickerField,
} from '@/components/shared/date-time-picker';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { ProspectingMeeting } from '@/types/auth';

export type PromptType = 'outcome' | 'cancel';

export function toLocalDatetimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function PromptDialog({
  type,
  saving,
  onClose,
  onSubmit,
}: {
  type: PromptType;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const { messages } = useI18n();
  const t = messages.meetingsPage;
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const title = type === 'outcome' ? t.outcomeDialogTitle : t.cancelDialogTitle;
  const label = type === 'outcome' ? t.outcomeDialogLabel : t.cancelDialogLabel;
  const placeholder =
    type === 'outcome' ? t.outcomeDialogPlaceholder : t.cancelDialogPlaceholder;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!value.trim()) return;
    onSubmit(value.trim());
  }

  return (
    <div
      className="b2b-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="b2b-modal b2b-modal-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
      >
        <button
          className="b2b-modal-close"
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label={t.dialogCancel}
        >
          ×
        </button>
        <h3 id="prompt-dialog-title">{title}</h3>
        <form onSubmit={handleSubmit}>
          <label className="drawer-field">
            <span>{label}</span>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={4}
              disabled={saving}
            />
          </label>
          {touched && !value.trim() ? (
            <p className="users-error" role="alert">
              {t.dialogRequiredHint}
            </p>
          ) : null}
          <div className="b2b-modal-actions">
            <button
              className="b2b-button b2b-button-primary"
              type="submit"
              disabled={saving}
            >
              {t.dialogSubmit}
            </button>
            <button
              className="b2b-button b2b-button-secondary"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              {t.dialogCancel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function RescheduleDialog({
  meeting,
  saving,
  onClose,
  onSubmit,
}: {
  meeting: ProspectingMeeting;
  saving: boolean;
  onClose: () => void;
  onSubmit: (scheduledAtIso: string) => void;
}) {
  const { messages } = useI18n();
  const t = messages.meetingsPage;
  const initial = new Date(meeting.scheduled_at);
  const initialHour24 = initial.getHours();
  const [visitDate, setVisitDate] = useState<Date | null>(initial);
  const [visitTime, setVisitTime] = useState<{
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  } | null>({
    hour: initialHour24 % 12 === 0 ? 12 : initialHour24 % 12,
    minute: initial.getMinutes(),
    period: initialHour24 >= 12 ? 'PM' : 'AM',
  });
  const [touched, setTouched] = useState(false);

  function toScheduledDate() {
    if (!visitDate || !visitTime) return null;
    const result = new Date(visitDate);
    const hour24 =
      visitTime.period === 'PM'
        ? visitTime.hour === 12
          ? 12
          : visitTime.hour + 12
        : visitTime.hour === 12
          ? 0
          : visitTime.hour;
    result.setHours(hour24, visitTime.minute, 0, 0);
    return result;
  }

  const scheduled = toScheduledDate();
  const invalid = !scheduled || scheduled < new Date();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (invalid || !scheduled) return;
    onSubmit(scheduled.toISOString());
  }

  return (
    <div
      className="b2b-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="b2b-modal b2b-modal-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-dialog-title"
      >
        <button
          className="b2b-modal-close"
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label={t.dialogCancel}
        >
          ×
        </button>
        <h3 id="reschedule-dialog-title">{t.rescheduleDialogTitle}</h3>
        <form onSubmit={handleSubmit}>
          <label className="drawer-field">
            <span>{t.rescheduleDialogLabel}</span>
            <div className="drawer-datetime-row">
              <DatePickerField
                value={visitDate}
                onChange={setVisitDate}
                min={new Date()}
                disabled={saving}
              />
              <TimePickerField
                value={visitTime}
                onChange={setVisitTime}
                disabled={saving}
              />
            </div>
          </label>
          {touched && invalid ? (
            <p className="users-error" role="alert">
              {t.rescheduleDialogInvalidHint}
            </p>
          ) : null}
          <div className="b2b-modal-actions">
            <button
              className="b2b-button b2b-button-primary"
              type="submit"
              disabled={saving}
            >
              {t.dialogSubmit}
            </button>
            <button
              className="b2b-button b2b-button-secondary"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              {t.dialogCancel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
