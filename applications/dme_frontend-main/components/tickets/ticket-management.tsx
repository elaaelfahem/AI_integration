'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { INTL_LOCALES, type Locale } from '@/lib/i18n/config';
import type {
  Ticket,
  TicketPriority,
  TicketReply,
  TicketStatus,
  TicketType,
} from '@/types/auth';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Toast } from '@/components/auth/toast';
import { TicketForm } from '@/components/tickets/ticket-form';
import { TicketSuccessModal } from '@/components/tickets/ticket-success-modal';
import { TableSkeletonRows } from '@/components/shared/table-skeleton';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  ticketPriorityLabel,
  ticketReference,
  ticketStatusLabel,
  ticketTypeLabel,
} from './ticket-shared';

function formatDate(iso: string, locale: Locale) {
  return new Date(iso).toLocaleDateString(INTL_LOCALES[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(INTL_LOCALES[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reporterName(ticket: Ticket) {
  const person = ticket.created_by?.user ?? ticket.created_by?.superadmin;
  return person ? `${person.first_name} ${person.last_name}` : '—';
}

function replyAuthorName(reply: TicketReply) {
  const person = reply.author?.user ?? reply.author?.superadmin;
  return person ? `${person.first_name} ${person.last_name}` : '—';
}

function formatReplyTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(INTL_LOCALES[locale], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketManagement() {
  const { messages, locale } = useI18n();
  const t = messages.ticketsPage;
  const router = useRouter();
  const [view, setView] = useState<'list' | 'new'>('list');
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    inProgress: 0,
    resolved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<TicketType | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'ALL'>(
    'ALL',
  );
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [updating, setUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  async function handleDownloadAttachment() {
    if (!selected) return;
    setDownloading(true);
    try {
      const { blob, filename } = await authApi.getTicketAttachment(selected.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.loadError);
    } finally {
      setDownloading(false);
    }
  }

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      const [list, statsResult] = await Promise.all([
        authApi.listTickets(query),
        authApi.getTicketStats(),
      ]);
      setTickets(list);
      setStats(statsResult);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, statusFilter, t.loadError, typeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTickets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter(
      (ticket) =>
        ticket.subject.toLowerCase().includes(query) ||
        ticketReference(ticket.number).toLowerCase().includes(query),
    );
  }, [tickets, search]);

  async function handleUpdate(input: {
    status?: TicketStatus;
    priority?: TicketPriority;
  }) {
    if (!selected) return;
    setUpdating(true);
    try {
      const updated = await authApi.updateTicket(selected.id, input);
      setSelected(updated);
      setTickets((current) =>
        current.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
      );
      setNotice(t.noticeUpdated);
      void loadTickets();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorUpdateFailed);
    } finally {
      setUpdating(false);
    }
  }

  async function handleSendReply() {
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const updated = await authApi.addTicketReply(
        selected.id,
        replyText.trim(),
      );
      setSelected(updated);
      setReplyText('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t.errorReplyFailed);
    } finally {
      setSendingReply(false);
    }
  }

  if (view === 'new') {
    return (
      <section
        className="users-page ticket-form-page"
        id="tickets"
        aria-labelledby="tickets-title"
      >
        <nav
          className="ticket-breadcrumb"
          aria-label={messages.shared.breadcrumbAria}
        >
          <button type="button" onClick={() => setView('list')}>
            {t.breadcrumbTickets}
          </button>
          <span aria-hidden="true">/</span>
          <span>{t.breadcrumbNew}</span>
        </nav>
        <h1 id="tickets-title">
          <strong>{t.formTitleStrong}</strong>
          {t.formTitleRest}
        </h1>
        <p className="ticket-form-subtitle">{t.formSubtitle}</p>
        <TicketForm
          onCancel={() => setView('list')}
          onCreated={(ticket) => {
            setCreatedTicket(ticket);
            void loadTickets();
          }}
        />
        {createdTicket ? (
          <TicketSuccessModal
            reference={ticketReference(createdTicket.number)}
            onViewTickets={() => {
              setCreatedTicket(null);
              setView('list');
            }}
            onGoHome={() => router.push('/dashboard')}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="users-page"
      id="tickets"
      aria-labelledby="tickets-title"
    >
      <div className="users-page-header">
        <h1 id="tickets-title">
          <strong>{t.titleStrong}</strong>
          {t.titleRest}
        </h1>
        <div className="users-page-actions">
          <button
            className="orange-button"
            type="button"
            onClick={() => setView('new')}
          >
            <span aria-hidden="true">+</span> {t.newTicketButton}
          </button>
        </div>
      </div>

      {notice ? (
        <Toast
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="users-stat-strip ticket-stat-strip"
        aria-label={t.titleRest}
      >
        <div className="users-stat">
          <div>
            <strong>{stats.total}</strong>
            <span>{t.statTotal}</span>
          </div>
          <Image
            src="/tickets/v1.svg"
            alt=""
            width={30}
            height={27}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>{stats.new}</strong>
            <span>{t.statNew}</span>
          </div>
          <Image
            src="/tickets/v2.svg"
            alt=""
            width={22}
            height={22}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>{stats.inProgress}</strong>
            <span>{t.statInProgress}</span>
          </div>
          <Image
            src="/tickets/v3.svg"
            alt=""
            width={26}
            height={27}
            aria-hidden="true"
          />
        </div>
        <div className="users-stat">
          <div>
            <strong>{stats.resolved}</strong>
            <span>{t.statResolved}</span>
          </div>
          <Image
            src="/tickets/v4.svg"
            alt=""
            width={28}
            height={28}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="users-toolbar agents-toolbar ticket-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </label>
        <FilterDropdown
          ariaLabel={t.filterStatusAll}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as TicketStatus | 'ALL')}
          options={[
            { value: 'ALL', label: t.filterStatusAll },
            ...TICKET_STATUSES.map((status) => ({
              value: status,
              label: ticketStatusLabel(status, t),
            })),
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterTypeAll}
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as TicketType | 'ALL')}
          options={[
            { value: 'ALL', label: t.filterTypeAll },
            ...TICKET_TYPES.map((type) => ({
              value: type,
              label: ticketTypeLabel(type, t),
            })),
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterPriorityAll}
          value={priorityFilter}
          onChange={(value) =>
            setPriorityFilter(value as TicketPriority | 'ALL')
          }
          options={[
            { value: 'ALL', label: t.filterPriorityAll },
            ...TICKET_PRIORITIES.map((priority) => ({
              value: priority,
              label: ticketPriorityLabel(priority, t),
            })),
          ]}
        />
      </div>

      <div className={selected ? 'ticket-split' : undefined}>
        <div className="users-table-wrap ticket-list-panel">
          <table
            className={`users-table ticket-table${selected ? ' ticket-table-compact' : ''}`}
          >
            <thead>
              <tr>
                <th>{t.colReference}</th>
                <th>{t.colSubject}</th>
                {selected ? null : (
                  <>
                    <th>{t.colType}</th>
                  </>
                )}
                <th>{t.colPriority}</th>
                {selected ? null : <th>{t.colDate}</th>}
                <th>{t.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeletonRows columns={selected ? 4 : 6} />
              ) : filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={selected ? 4 : 6}>{t.emptyState}</td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelected(ticket)}
                    className={`ticket-row${selected?.id === ticket.id ? ' ticket-row-active' : ''}`}
                  >
                    <td data-label={t.colReference}>
                      {ticketReference(ticket.number)}
                    </td>
                    {selected ? (
                      <td data-label={t.colSubject}>
                        <span className="ticket-subject-cell">
                          {ticket.subject}
                        </span>
                        <span className="ticket-subject-meta">
                          {reporterName(ticket)} •{' '}
                          {formatDate(ticket.created_at, locale)}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td data-label={t.colSubject}>{ticket.subject}</td>
                        <td data-label={t.colType}>
                          {ticketTypeLabel(ticket.type, t)}
                        </td>
                      </>
                    )}
                    <td data-label={t.colPriority}>
                      <span
                        className={`b2b-status ticket-priority-pill ticket-priority-${ticket.priority.toLowerCase()}`}
                      >
                        {ticketPriorityLabel(ticket.priority, t)}
                      </span>
                    </td>
                    {selected ? null : (
                      <td data-label={t.colDate}>
                        {formatDate(ticket.created_at, locale)}
                      </td>
                    )}
                    <td data-label={t.colStatus}>
                      <span
                        className={`b2b-status ticket-status-pill ticket-status-${ticket.status.toLowerCase()}`}
                      >
                        {ticketStatusLabel(ticket.status, t)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <aside
            className="ticket-detail-panel"
            aria-labelledby="ticket-detail-title"
          >
            <div className="ticket-detail-panel-head">
              <div className="ticket-detail-panel-headline">
                <span
                  id="ticket-detail-title"
                  className="ticket-detail-eyebrow"
                >
                  {t.detailTitlePrefix} {ticketReference(selected.number)}
                </span>
                <div className="ticket-detail-badges">
                  <span
                    className={`b2b-status ticket-priority-pill ticket-priority-${selected.priority.toLowerCase()}`}
                  >
                    {ticketPriorityLabel(selected.priority, t)}
                  </span>
                  <span
                    className={`b2b-status ticket-status-pill ticket-status-${selected.status.toLowerCase()}`}
                  >
                    {ticketStatusLabel(selected.status, t)}
                  </span>
                </div>
              </div>
              <h3>{selected.subject}</h3>
              <p className="ticket-detail-reporter">
                {t.detailReportedBy} <strong>{reporterName(selected)}</strong>{' '}
                {messages.shared.reportedOn}{' '}
                {formatDateTime(selected.created_at, locale)}
              </p>
            </div>
            <hr />
            <div className="ticket-detail-section">
              <span className="ticket-detail-eyebrow">
                {t.detailDescriptionLabel}
              </span>
              <p className="ticket-detail-description">
                {selected.description}
              </p>
            </div>
            {selected.attachment_name ? (
              <div className="ticket-detail-section">
                <span className="ticket-detail-eyebrow">
                  {t.detailAttachmentLabel}
                </span>
                <div className="ticket-attachment-row">
                  <Image
                    src="/tickets/Vector.svg"
                    alt=""
                    width={15}
                    height={18}
                    aria-hidden="true"
                  />
                  <span className="ticket-attachment-name">
                    {selected.attachment_name}
                  </span>
                  <button
                    type="button"
                    className="ticket-attachment-download"
                    disabled={downloading}
                    onClick={() => void handleDownloadAttachment()}
                    aria-label={t.detailDownloadAttachment}
                  >
                    <Image
                      src="/tickets/download.svg"
                      alt=""
                      width={15}
                      height={15}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="ticket-detail-section">
              <span className="ticket-detail-eyebrow">
                {messages.shared.actions}
              </span>
              <div className="ticket-detail-actions">
                <label className="ticket-detail-action-field">
                  <span>{t.detailStatusLabel}</span>
                  <select
                    value={selected.status}
                    disabled={updating}
                    onChange={(event) =>
                      void handleUpdate({
                        status: event.target.value as TicketStatus,
                      })
                    }
                  >
                    {TICKET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ticketStatusLabel(status, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ticket-detail-action-field">
                  <span>{t.detailPriorityLabel}</span>
                  <select
                    value={selected.priority}
                    disabled={updating}
                    onChange={(event) =>
                      void handleUpdate({
                        priority: event.target.value as TicketPriority,
                      })
                    }
                  >
                    {TICKET_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {ticketPriorityLabel(priority, t)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <hr />
            <div className="ticket-detail-section ticket-reply-section">
              {selected.replies && selected.replies.length > 0 ? (
                <div className="ticket-reply-list">
                  {selected.replies.map((reply) => (
                    <div className="ticket-reply-item" key={reply.id}>
                      <div className="ticket-reply-item-head">
                        <strong>{replyAuthorName(reply)}</strong>
                        <span>{formatReplyTime(reply.created_at, locale)}</span>
                      </div>
                      <p>{reply.message}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <form
                className="ticket-reply-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSendReply();
                }}
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={t.detailReplyPlaceholder}
                  disabled={sendingReply}
                />
                <button
                  type="submit"
                  className="ticket-reply-send"
                  disabled={sendingReply || !replyText.trim()}
                  aria-label={t.detailReplyPlaceholder}
                >
                  <Image
                    src="/tickets/send.svg"
                    alt=""
                    width={13}
                    height={13}
                    aria-hidden="true"
                  />
                </button>
              </form>
            </div>
            <button
              type="button"
              className="outline-button ticket-detail-close"
              onClick={() => setSelected(null)}
            >
              {t.formCancel}
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
