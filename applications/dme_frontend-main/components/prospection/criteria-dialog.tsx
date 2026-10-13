'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { ProspectingCriteria } from '@/types/auth';

export function SparkleIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path
        d="M10 3L11.5 7.5L16 9L11.5 10.5L10 15L8.5 10.5L4 9L8.5 7.5L10 3Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 14L19.75 16.25L22 17L19.75 17.75L19 20L18.25 17.75L16 17L18.25 16.25L19 14Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 4L18.5 5.5L20 6L18.5 6.5L18 8L17.5 6.5L16 6L17.5 5.5L18 4Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CriteriaDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (criteria: ProspectingCriteria) => void | Promise<void>;
}) {
  const { messages } = useI18n();
  const t = messages.prospectionPage;
  const c = t.criteria;
  const [isClosing, setIsClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sector, setSector] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [employeeRange, setEmployeeRange] =
    useState<ProspectingCriteria['employeeRange']>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authApi
      .getProspectingCriteria()
      .then((saved) => {
        if (!active) return;
        setSector(saved.sector ?? '');
        setGovernorate(saved.governorate ?? '');
        setEmployeeRange(saved.employeeRange ?? null);
        setQuery(saved.query ?? '');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof ApiError ? reason.message : c.loadError);
      });

    return () => {
      active = false;
    };
  }, [c.loadError]);

  function handleClose() {
    if (submitting) return;
    setIsClosing(true);
    setTimeout(onClose, 200);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const criteria = {
      sector: sector || null,
      governorate: governorate || null,
      employeeRange,
      query: query || null,
    } satisfies ProspectingCriteria;
    try {
      await authApi.updateProspectingCriteria(criteria);
      setIsClosing(true);
      window.setTimeout(() => void onSubmit(criteria), 200);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : c.saveError);
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`prospection-overlay ${isClosing ? 'closing' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="prospection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="criteria-title"
      >
        <button
          className="prospection-dialog-close"
          type="button"
          onClick={handleClose}
          disabled={submitting}
          aria-label={t.close}
        >
          ×
        </button>
        <h2
          id="criteria-title"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontWeight: 700,
          }}
        >
          <SparkleIcon style={{ color: 'var(--orange)' }} />
          {c.title}
        </h2>
        <div className="prospection-criteria-grid">
          <label>
            {c.sectorLabel}
            <select
              value={sector}
              onChange={(event) => setSector(event.target.value)}
            >
              <option value="">{c.sectorPlaceholder}</option>
              <option value="tech">{c.sectorTech}</option>
              <option value="industry">{c.sectorIndustry}</option>
              <option value="health">{c.sectorHealth}</option>
            </select>
          </label>
          <label>
            {c.locationLabel}
            <input
              value={governorate}
              onChange={(event) => setGovernorate(event.target.value)}
              placeholder={c.locationPlaceholder}
            />
          </label>
          <label>
            {c.sizeLabel}
            <select
              value={employeeRange ?? ''}
              onChange={(event) =>
                setEmployeeRange(
                  (event.target.value ||
                    null) as ProspectingCriteria['employeeRange'],
                )
              }
            >
              <option value="">{c.sizePlaceholder}</option>
              <option value="10-50">{c.size10to50}</option>
              <option value="50-250">{c.size50to250}</option>
              <option value="250+">{c.size250plus}</option>
            </select>
          </label>
        </div>
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="prospection-criteria-notes">
          {c.queryLabel}
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={c.queryPlaceholder}
          />
        </label>
        <div className="prospection-dialog-actions">
          <button
            className="outline-button orange-outline"
            type="button"
            onClick={handleClose}
            disabled={submitting}
          >
            {t.cancel}
          </button>
          <button
            className="orange-button"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              justifyContent: 'center',
            }}
          >
            <SparkleIcon />
            {submitting ? t.launching : t.launch}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
