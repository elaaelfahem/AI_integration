import type { Messages } from '@/lib/i18n/messages';
import type { TicketPriority, TicketStatus, TicketType } from '@/types/auth';

export const TICKET_TYPES: TicketType[] = [
  'TECHNICAL',
  'CONNECTION',
  'COMPANY',
  'REPORT',
  'AI',
  'VISIT',
  'OTHER',
];

export const TICKET_PRIORITIES: TicketPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

export const TICKET_STATUSES: TicketStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
];

export function ticketTypeLabel(type: TicketType, t: Messages['ticketsPage']) {
  switch (type) {
    case 'TECHNICAL':
      return t.typeTechnical;
    case 'CONNECTION':
      return t.typeConnection;
    case 'COMPANY':
      return t.typeCompany;
    case 'REPORT':
      return t.typeReport;
    case 'AI':
      return t.typeAi;
    case 'VISIT':
      return t.typeVisit;
    default:
      return t.typeOther;
  }
}

export function ticketPriorityLabel(
  priority: TicketPriority,
  t: Messages['ticketsPage'],
) {
  switch (priority) {
    case 'LOW':
      return t.priorityLow;
    case 'MEDIUM':
      return t.priorityMedium;
    case 'HIGH':
      return t.priorityHigh;
    default:
      return t.priorityCritical;
  }
}

export function ticketStatusLabel(
  status: TicketStatus,
  t: Messages['ticketsPage'],
) {
  switch (status) {
    case 'NEW':
      return t.statusNew;
    case 'IN_PROGRESS':
      return t.statusInProgress;
    default:
      return t.statusResolved;
  }
}

export function ticketReference(number: number) {
  return `#TCK-${String(number).padStart(4, '0')}`;
}
