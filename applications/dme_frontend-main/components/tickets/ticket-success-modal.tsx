'use client';

import Image from 'next/image';
import { useI18n } from '@/lib/i18n/i18n-context';

export function TicketSuccessModal({
  reference,
  onViewTickets,
  onGoHome,
}: {
  reference: string;
  onViewTickets: () => void;
  onGoHome: () => void;
}) {
  const { messages } = useI18n();
  const t = messages.ticketsPage;

  return (
    <div className="ticket-success-backdrop" role="presentation">
      <div
        className="ticket-success-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-success-title"
      >
        <Image
          src="/tickets/image%2017.svg"
          alt=""
          width={168}
          height={121}
          aria-hidden="true"
        />
        <div className="ticket-success-body">
          <h2 id="ticket-success-title">{t.modalSuccessTitle}</h2>
          <span className="ticket-success-reference">
            {t.modalSuccessReferencePrefix}
            {reference}
          </span>
          <p>{t.modalSuccessSubtitle}</p>
        </div>
        <div className="ticket-success-actions">
          <button
            className="orange-button"
            type="button"
            onClick={onViewTickets}
          >
            {t.modalViewTickets}
          </button>
          <button className="outline-button" type="button" onClick={onGoHome}>
            {t.modalGoHome}
          </button>
        </div>
      </div>
    </div>
  );
}
