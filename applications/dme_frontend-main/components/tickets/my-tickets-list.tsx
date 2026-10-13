'use client';

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import { TableSkeletonRows } from '@/components/shared/table-skeleton';
import { useI18n } from '@/lib/i18n/i18n-context';
import { INTL_LOCALES, type Locale } from '@/lib/i18n/config';
import type { Ticket } from '@/types/auth';
import {
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

export function MyTicketsList({ onNewTicket }: { onNewTicket: () => void }) {
  const { messages, locale } = useI18n();
  const t = messages.ticketsPage;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      authApi
        .listTickets()
        .then((list) => setTickets(list))
        .catch(() => setError(t.loadError))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [t.loadError]);

  return (
    <section
      className="users-page"
      id="tickets"
      aria-labelledby="my-tickets-title"
    >
      <div className="users-page-header">
        <h1 id="my-tickets-title">
          <strong>{t.myTicketsTitleStrong}</strong>
          {t.myTicketsTitleRest}
        </h1>
        <div className="users-page-actions">
          <button className="orange-button" type="button" onClick={onNewTicket}>
            <span aria-hidden="true">+</span> {t.newTicketButton}
          </button>
        </div>
      </div>

      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="users-table-wrap">
        <table className="users-table ticket-table">
          <thead>
            <tr>
              <th>{t.colReference}</th>
              <th>{t.colSubject}</th>
              <th>{t.colType}</th>
              <th>{t.colPriority}</th>
              <th>{t.colDate}</th>
              <th>{t.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeletonRows columns={6} />
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6}>{t.emptyState}</td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td data-label={t.colReference}>
                    {ticketReference(ticket.number)}
                  </td>
                  <td data-label={t.colSubject}>{ticket.subject}</td>
                  <td data-label={t.colType}>
                    {ticketTypeLabel(ticket.type, t)}
                  </td>
                  <td data-label={t.colPriority}>
                    <span
                      className={`b2b-status ticket-priority-pill ticket-priority-${ticket.priority.toLowerCase()}`}
                    >
                      {ticketPriorityLabel(ticket.priority, t)}
                    </span>
                  </td>
                  <td data-label={t.colDate}>
                    {formatDate(ticket.created_at, locale)}
                  </td>
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
    </section>
  );
}
