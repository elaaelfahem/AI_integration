'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { INTL_LOCALES } from '@/lib/i18n/config';
import type {
  VisitReport,
  VisitReportInterestLevel,
  VisitReportNeed,
  VisitReportOutcome,
  VisitReportSolution,
} from '@/types/auth';
import {
  VISIT_REPORT_INTEREST_LEVELS,
  VISIT_REPORT_NEEDS,
  VISIT_REPORT_OUTCOMES,
  VISIT_REPORT_SOLUTIONS,
  visitReportInterestLabel,
  visitReportNeedLabel,
  visitReportOutcomeLabel,
  visitReportSolutionLabel,
  visitReportStatusLabel,
} from './visit-report-shared';

export function VisitReportDrawer({
  meetingId,
  companyName,
  canEdit,
  onClose,
  onSaved,
}: {
  meetingId: string;
  companyName: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (report: VisitReport) => void;
}) {
  const { messages, locale } = useI18n();
  const t = messages.visitReportsPage;
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<VisitReport | null>(null);
  const [summary, setSummary] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [cleaned, setCleaned] = useState<Awaited<
    ReturnType<typeof authApi.cleanVisitReport>
  > | null>(null);
  const [needs, setNeeds] = useState<VisitReportNeed[]>([]);
  const [solutions, setSolutions] = useState<VisitReportSolution[]>([]);
  const [interestLevel, setInterestLevel] = useState<
    VisitReportInterestLevel | ''
  >('');
  const [outcomeResult, setOutcomeResult] = useState<VisitReportOutcome | ''>(
    '',
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authApi
      .getVisitReport(meetingId)
      .then((existing) => {
        if (cancelled) return;
        setReport(existing);
        setSummary(existing.summary ?? '');
        setNeeds(existing.needs);
        setSolutions(existing.solutions);
        setInterestLevel(existing.interest_level ?? '');
        setOutcomeResult(existing.outcome_result ?? '');
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const readOnly = !canEdit || (!!report && report.status !== 'DRAFT');

  function toggleNeed(need: VisitReportNeed) {
    setNeeds((current) =>
      current.includes(need)
        ? current.filter((item) => item !== need)
        : [...current, need],
    );
  }

  function toggleSolution(solution: VisitReportSolution) {
    setSolutions((current) =>
      current.includes(solution)
        ? current.filter((item) => item !== solution)
        : [...current, solution],
    );
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const updated = await authApi.saveVisitReport(meetingId, {
        summary,
        needs,
        solutions,
        ...(interestLevel && { interestLevel }),
        ...(outcomeResult && { outcomeResult }),
      });
      setReport(updated);
      onSaved?.(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!summary.trim()) {
      setError(t.errorSummaryRequired);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await authApi.saveVisitReport(meetingId, {
        summary,
        needs,
        solutions,
        ...(interestLevel && { interestLevel }),
        ...(outcomeResult && { outcomeResult }),
      });
      const submitted = await authApi.submitVisitReport(meetingId);
      setReport(submitted);
      onSaved?.(submitted);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorSubmitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError('');
    try {
      const updated = await authApi.addVisitReportAttachment(meetingId, file);
      setReport(updated);
      onSaved?.(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorSaveFailed);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentId: string) {
    try {
      await authApi.removeVisitReportAttachment(meetingId, attachmentId);
      const updated = await authApi.getVisitReport(meetingId);
      setReport(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorSaveFailed);
    }
  }

  async function handleAddNote() {
    const body = noteText.trim();
    if (!body) return;
    setAddingNote(true);
    setError('');
    try {
      const updated = await authApi.addVisitReportNote(meetingId, body);
      setReport(updated);
      setNoteText('');
      onSaved?.(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorNoteFailed);
    } finally {
      setAddingNote(false);
    }
  }

  async function handleRemoveNote(noteId: string) {
    try {
      await authApi.removeVisitReportNote(meetingId, noteId);
      const updated = await authApi.getVisitReport(meetingId);
      setReport(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorNoteFailed);
    }
  }

  async function handleDownloadAttachment(attachmentId: string) {
    try {
      const { blob, filename } = await authApi.getVisitReportAttachment(
        meetingId,
        attachmentId,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorSaveFailed);
    }
  }

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="user-drawer visit-report-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-report-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={onClose}
          aria-label={t.formCancel}
        >
          ×
        </button>
        <h2 id="visit-report-title">{t.formTitle}</h2>
        <p>
          {companyName}
          {report ? ` · ${visitReportStatusLabel(report.status, t)}` : ''}
        </p>
        <hr />
        {loading ? (
          <div className="drawer-field-group">
            <span className="skeleton-box" style={{ height: 90 }} />
            <span className="skeleton-box" style={{ height: 60 }} />
            <span className="skeleton-box" style={{ height: 60 }} />
            <span
              className="skeleton-box"
              style={{ height: 40, width: '50%' }}
            />
          </div>
        ) : !report && !canEdit ? (
          <p>{t.emptyState}</p>
        ) : (
          <div className="drawer-field-group">
            <label className="drawer-field">
              <span>{t.formSummaryLabel}</span>
              <textarea
                value={summary}
                onChange={(event) => {
                  setSummary(event.target.value);
                  setCleaned(null);
                }}
                placeholder={t.formSummaryPlaceholder}
                rows={4}
                disabled={readOnly}
              />
            </label>
            {!readOnly && (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={cleaning || !summary.trim()}
                  onClick={async () => {
                    setCleaning(true);
                    setCleaned(null);
                    setError('');
                    try {
                      setCleaned(
                        await authApi.cleanVisitReport(meetingId, summary),
                      );
                    } catch {
                      setError(
                        locale === 'fr'
                          ? 'Nettoyage indisponible. Réessayez.'
                          : 'Report cleanup unavailable. Please retry.',
                      );
                    } finally {
                      setCleaning(false);
                    }
                  }}
                >
                  {cleaning
                    ? locale === 'fr'
                      ? 'Analyse…'
                      : 'Analyzing…'
                    : locale === 'fr'
                      ? 'Proposer un résumé'
                      : 'Suggest a summary'}
                </button>
                {cleaned && (
                  <div aria-live="polite">
                    <p>{cleaned.executive_summary}</p>
                    {!cleaned.model_used && (
                      <p>
                        {locale === 'fr'
                          ? 'Résumé basé sur les règles.'
                          : 'Rule-based summary.'}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSummary(cleaned.executive_summary);
                        setCleaned(null);
                      }}
                    >
                      {locale === 'fr'
                        ? 'Utiliser ce résumé'
                        : 'Use this summary'}
                    </button>
                    <button type="button" onClick={() => setCleaned(null)}>
                      {locale === 'fr' ? 'Conserver mon texte' : 'Keep my text'}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="drawer-field">
              <span>{t.formNeedsLabel}</span>
              <div className="visit-report-chip-group">
                {VISIT_REPORT_NEEDS.map((need) => (
                  <button
                    key={need}
                    type="button"
                    className={needs.includes(need) ? 'active' : undefined}
                    disabled={readOnly}
                    onClick={() => toggleNeed(need)}
                  >
                    {visitReportNeedLabel(need, t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="drawer-field">
              <span>{t.formSolutionsLabel}</span>
              <div className="visit-report-chip-group">
                {VISIT_REPORT_SOLUTIONS.map((solution) => (
                  <button
                    key={solution}
                    type="button"
                    className={
                      solutions.includes(solution) ? 'active' : undefined
                    }
                    disabled={readOnly}
                    onClick={() => toggleSolution(solution)}
                  >
                    {visitReportSolutionLabel(solution, t)}
                  </button>
                ))}
              </div>
            </div>
            <label className="drawer-field">
              <span>{t.formInterestLabel}</span>
              <select
                value={interestLevel}
                disabled={readOnly}
                onChange={(event) =>
                  setInterestLevel(
                    event.target.value as VisitReportInterestLevel | '',
                  )
                }
              >
                <option value="">—</option>
                {VISIT_REPORT_INTEREST_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {visitReportInterestLabel(level, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="drawer-field">
              <span>{t.formOutcomeLabel}</span>
              <select
                value={outcomeResult}
                disabled={readOnly}
                onChange={(event) =>
                  setOutcomeResult(
                    event.target.value as VisitReportOutcome | '',
                  )
                }
              >
                <option value="">—</option>
                {VISIT_REPORT_OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {visitReportOutcomeLabel(outcome, t)}
                  </option>
                ))}
              </select>
            </label>
            <div className="drawer-field">
              <span>{t.formNotesLabel}</span>
              <div className="visit-report-notes-list">
                {report?.notes && report.notes.length > 0 ? (
                  report.notes.map((note) => {
                    const person = note.author?.user;
                    return (
                      <div className="visit-report-note-item" key={note.id}>
                        <p>{note.body}</p>
                        <div className="visit-report-note-meta">
                          <span>
                            {person
                              ? `${person.first_name} ${person.last_name} · `
                              : ''}
                            {new Date(note.created_at).toLocaleString(
                              INTL_LOCALES[locale],
                              {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="visit-report-attachment-remove"
                              onClick={() => void handleRemoveNote(note.id)}
                              aria-label={t.formCancel}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="visit-report-notes-empty">{t.formNotesEmpty}</p>
                )}
              </div>
              {canEdit ? (
                <div className="visit-report-note-form">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={t.formNotesPlaceholder}
                    disabled={addingNote}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleAddNote();
                      }
                    }}
                    onBlur={() => {
                      if (noteText.trim()) void handleAddNote();
                    }}
                  />
                  <button
                    className="outline-button"
                    type="button"
                    disabled={addingNote || !noteText.trim()}
                    onClick={() => void handleAddNote()}
                  >
                    {addingNote ? t.formSaving : t.formNotesAdd}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="drawer-field">
              <span>{t.formAttachmentsLabel}</span>
              {report?.attachments.map((attachment) => (
                <div className="ticket-attachment-row" key={attachment.id}>
                  <span className="ticket-attachment-name">
                    {attachment.file_name}
                  </span>
                  <button
                    type="button"
                    className="ticket-attachment-download"
                    onClick={() => void handleDownloadAttachment(attachment.id)}
                    aria-label={attachment.file_name}
                  >
                    <Image
                      src="/tickets/download.svg"
                      alt=""
                      width={15}
                      height={15}
                      aria-hidden="true"
                    />
                  </button>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="visit-report-attachment-remove"
                      onClick={() => void handleRemoveAttachment(attachment.id)}
                      aria-label={t.formCancel}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {!readOnly ? (
                <label className="ticket-attachment-drop">
                  <Image
                    src="/tickets/upload-cloud.svg"
                    alt=""
                    width={24}
                    height={24}
                    aria-hidden="true"
                  />
                  <span className="ticket-attachment-hint">
                    {uploading ? t.formSaving : t.formAttachmentHint}
                  </span>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              ) : null}
            </div>
            {error ? (
              <p className="users-error" role="alert">
                {error}
              </p>
            ) : null}
            {!readOnly ? (
              <div className="drawer-actions">
                <button
                  className="outline-button"
                  type="button"
                  disabled={saving || submitting}
                  onClick={() => void handleSave()}
                >
                  {saving ? t.formSaving : t.formSaveDraft}
                </button>
                <button
                  className="orange-button"
                  type="button"
                  disabled={saving || submitting}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? t.formSubmitting : t.formSubmit}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
