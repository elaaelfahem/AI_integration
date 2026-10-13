'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildCalendarDays(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - mondayIndex(firstOfMonth));
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

function MiniDropdown({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <div
      className={`date-picker-mini-dropdown${className ? ` ${className}` : ''}`}
      ref={ref}
    >
      <button
        type="button"
        className="date-picker-mini-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <Image
          src="/down_arrow_outline.svg"
          alt=""
          width={9}
          height={5}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="date-picker-mini-list" role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'active' : undefined}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DatePickerField({
  value,
  onChange,
  min,
  disabled,
  placeholder = 'mm/dd/yyyy',
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  min?: Date;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ?? new Date());
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = buildCalendarDays(year, month);
  const today = startOfDay(new Date());
  const minDay = min ? startOfDay(min) : null;
  const yearOptions = Array.from(
    { length: 12 },
    (_, i) => today.getFullYear() - 1 + i,
  );

  const displayValue = value
    ? `${pad(value.getMonth() + 1)}/${pad(value.getDate())}/${value.getFullYear()}`
    : '';

  return (
    <div className="picker-field" ref={ref}>
      <button
        type="button"
        className="picker-field-trigger"
        disabled={disabled}
        onClick={() => {
          setViewDate(value ?? new Date());
          setOpen((current) => !current);
        }}
      >
        <span className={displayValue ? undefined : 'picker-field-placeholder'}>
          {displayValue || placeholder}
        </span>
        <Image
          src="/calendar.svg"
          alt=""
          width={16}
          height={16}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="picker-popup date-picker-popup" role="dialog">
          <div className="date-picker-nav">
            <div className="date-picker-nav-left">
              <MiniDropdown
                className="date-picker-year-select"
                value={String(year)}
                options={yearOptions.map((y) => ({
                  value: String(y),
                  label: String(y),
                }))}
                onChange={(v) => setViewDate(new Date(Number(v), month, 1))}
              />
              <MiniDropdown
                className="date-picker-month-select"
                value={String(month)}
                options={MONTH_LABELS.map((label, index) => ({
                  value: String(index),
                  label,
                }))}
                onChange={(v) => setViewDate(new Date(year, Number(v), 1))}
              />
            </div>
            <div className="date-picker-arrows">
              <button
                type="button"
                aria-label={messages.shared.datePicker.previousMonth}
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={messages.shared.datePicker.nextMonth}
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
              >
                ›
              </button>
            </div>
          </div>
          <div className="date-picker-weekdays">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {days.map((day) => {
              const outside = day.getMonth() !== month;
              const disabledDay = minDay ? day < minDay : false;
              const isToday = day.getTime() === today.getTime();
              const isSelected =
                value && day.getTime() === startOfDay(value).getTime();
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabledDay}
                  className={`date-picker-day${outside ? ' date-picker-day-outside' : ''}${
                    isToday ? ' date-picker-day-today' : ''
                  }${isSelected ? ' date-picker-day-selected' : ''}`}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="date-picker-today-button"
            disabled={minDay ? today < minDay : false}
            onClick={() => {
              setViewDate(today);
              onChange(today);
              setOpen(false);
            }}
          >
            {messages.meetingsPage.todayButtonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TimePickerField({
  value,
  onChange,
  disabled,
  placeholder = '--:-- --',
}: {
  value: { hour: number; minute: number; period: 'AM' | 'PM' } | null;
  onChange: (value: {
    hour: number;
    minute: number;
    period: 'AM' | 'PM';
  }) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const picker = useI18n().messages.shared.datePicker;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const current = value ?? { hour: 12, minute: 0, period: 'AM' as const };

  function step(field: 'hour' | 'minute' | 'period', delta: 1 | -1) {
    const next = { ...current };
    if (field === 'hour') {
      next.hour = ((next.hour - 1 + delta + 12) % 12) + 1;
    } else if (field === 'minute') {
      next.minute = (next.minute + delta + 60) % 60;
    } else {
      next.period = next.period === 'AM' ? 'PM' : 'AM';
    }
    onChange(next);
  }

  const displayValue = value
    ? `${pad(value.hour)}:${pad(value.minute)}${value.period}`
    : '';

  return (
    <div className="picker-field" ref={ref}>
      <button
        type="button"
        className="picker-field-trigger"
        disabled={disabled}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={displayValue ? undefined : 'picker-field-placeholder'}>
          {displayValue || placeholder}
        </span>
        <Image
          src="/clock.svg"
          alt=""
          width={16}
          height={16}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="picker-popup time-picker-popup" role="dialog">
          <div className="time-picker-column">
            <button
              type="button"
              aria-label={picker.increaseHour}
              onClick={() => step('hour', 1)}
            >
              ^
            </button>
            <span>{pad(current.hour)}</span>
            <button
              type="button"
              aria-label={picker.decreaseHour}
              onClick={() => step('hour', -1)}
            >
              v
            </button>
          </div>
          <div className="time-picker-column">
            <button
              type="button"
              aria-label={picker.increaseMinute}
              onClick={() => step('minute', 1)}
            >
              ^
            </button>
            <span>{pad(current.minute)}</span>
            <button
              type="button"
              aria-label={picker.decreaseMinute}
              onClick={() => step('minute', -1)}
            >
              v
            </button>
          </div>
          <span className="time-picker-colon">:</span>
          <div className="time-picker-column">
            <button
              type="button"
              aria-label={picker.toggleAmPm}
              onClick={() => step('period', 1)}
            >
              ^
            </button>
            <span>{current.period}</span>
            <button type="button" aria-label={picker.toggleAmPm} disabled>
              v
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
