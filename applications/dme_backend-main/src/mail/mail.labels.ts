import type {
  AssignmentPriority,
  ReportVerdict,
  TicketPriority,
  TicketStatus,
  TicketType,
  VisitType,
} from '@prisma/client';

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  FIRST_VISIT: 'Première visite',
  FOLLOW_UP: 'Visite de suivi',
  DEMONSTRATION: 'Démonstration',
  CONTRACT: 'Signature de contrat',
  OTHER: 'Autre',
};

export const ASSIGNMENT_PRIORITY_LABELS: Record<AssignmentPriority, string> = {
  HIGH: 'Haute',
  MEDIUM: 'Moyenne',
  LOW: 'Basse',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  CRITICAL: 'Critique',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'Nouveau',
  IN_PROGRESS: 'En cours de traitement',
  RESOLVED: 'Résolu',
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  TECHNICAL: 'Problème technique',
  CONNECTION: 'Connexion',
  COMPANY: 'Entreprise',
  REPORT: 'Rapport',
  AI: 'Intelligence artificielle',
  VISIT: 'Visite',
  OTHER: 'Autre',
};

export const REPORT_VERDICT_LABELS: Record<ReportVerdict, string> = {
  QUALIFIED_FOLLOW_UP: 'Qualifié, à relancer',
  PENDING_INFORMATION: 'Informations en attente',
  NOT_ELIGIBLE: 'Non éligible',
  CONVERTED: 'Converti',
};

export const MAIL_TIME_ZONE = 'Africa/Tunis';

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: MAIL_TIME_ZONE,
});

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

export function ticketReference(number: number) {
  return `#TCK-${String(number).padStart(4, '0')}`;
}
