'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/workspace/app-shell';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n/i18n-context';
import { TicketForm } from '@/components/tickets/ticket-form';
import { TicketManagement } from '@/components/tickets/ticket-management';
import { TicketSuccessModal } from '@/components/tickets/ticket-success-modal';
import { MyTicketsList } from '@/components/tickets/my-tickets-list';
import { ticketReference } from '@/components/tickets/ticket-shared';
import type { Ticket } from '@/types/auth';

export default function TicketsPage() {
  const { account } = useAuth();
  const { messages } = useI18n();
  const router = useRouter();
  const t = messages.ticketsPage;
  const [view, setView] = useState<'form' | 'my-tickets'>('my-tickets');
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

  if (account?.role === 'SUPERADMIN') {
    return (
      <AppShell>
        <TicketManagement />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {view === 'my-tickets' ? (
        <MyTicketsList onNewTicket={() => setView('form')} />
      ) : (
        <section
          className="users-page ticket-form-page"
          id="tickets"
          aria-labelledby="tickets-title"
        >
          <h1 id="tickets-title">
            <strong>{t.formTitleStrong}</strong>
            {t.formTitleRest}
          </h1>
          <p className="ticket-form-subtitle">{t.formSubtitle}</p>
          <TicketForm
            onCancel={() => setView('my-tickets')}
            onCreated={(ticket) => setCreatedTicket(ticket)}
          />
        </section>
      )}
      {createdTicket ? (
        <TicketSuccessModal
          reference={ticketReference(createdTicket.number)}
          onViewTickets={() => {
            setCreatedTicket(null);
            setView('my-tickets');
          }}
          onGoHome={() => router.push('/dashboard')}
        />
      ) : null}
    </AppShell>
  );
}
