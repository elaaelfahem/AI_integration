import type {
  AssignmentPriority,
  ReportVerdict,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
  VisitType,
} from '@prisma/client';
import { MAIL_TIME_ZONE } from './mail.labels';

/**
 * Language of emails and notifications. Every account has one (`locale`,
 * French by default); unknown values fall back to French.
 */
export type MailLocale = 'fr' | 'en';

export function mailLocale(value: string | null | undefined): MailLocale {
  return value === 'en' ? 'en' : 'fr';
}

const INTL: Record<MailLocale, string> = { fr: 'fr-FR', en: 'en-GB' };

function formatter(locale: MailLocale, options: Intl.DateTimeFormatOptions) {
  const format = new Intl.DateTimeFormat(INTL[locale], {
    ...options,
    timeZone: MAIL_TIME_ZONE,
  });
  return (date: Date) => format.format(date);
}

const join = (locale: MailLocale, labels: string[]) => {
  if (labels.length <= 1) return labels[0] ?? '';
  const last = labels[labels.length - 1];
  return `${labels.slice(0, -1).join(', ')} ${locale === 'fr' ? 'et' : 'and'} ${last}`;
};

/** Everything an email or notification says, in one language. */
export interface MailText {
  locale: MailLocale;
  hello(name?: string): string;
  signOff: string;
  team: string;
  footers: { default: string; security: string; work: string };
  dateTime(date: Date): string;
  day(date: Date): string;
  time(date: Date): string;
  shortDate(date: Date): string;
  list(labels: string[]): string;

  label: Record<
    | 'company'
    | 'address'
    | 'date'
    | 'duration'
    | 'visitType'
    | 'priority'
    | 'objectives'
    | 'reason'
    | 'subject'
    | 'place'
    | 'link'
    | 'visit'
    | 'visitDate'
    | 'name'
    | 'email'
    | 'role'
    | 'verdict'
    | 'nextAction'
    | 'followUp'
    | 'reference'
    | 'type'
    | 'status'
    | 'oldStatus'
    | 'newStatus'
    | 'description'
    | 'startedAt'
    | 'sources'
    | 'error'
    | 'device'
    | 'ipAddress',
    string
  >;
  visitType: Record<VisitType, string>;
  assignmentPriority: Record<AssignmentPriority, string>;
  ticketPriority: Record<TicketPriority, string>;
  ticketStatus: Record<TicketStatus, string>;
  ticketType: Record<TicketType, string>;
  verdict: Record<ReportVerdict, string>;
  role: Record<UserRole, string>;
  /** Field names used in "Visite modifiée: les objectifs et la priorité". */
  field: Record<
    | 'company'
    | 'objectives'
    | 'visitType'
    | 'priority'
    | 'duration'
    | 'title'
    | 'agenda'
    | 'place'
    | 'link',
    string
  >;
  someone: {
    agent: string;
    colleague: string;
    user: string;
    yourAgent: string;
  };

  code: {
    mfaSubject: string;
    resetSubject: string;
    title: string;
    mfaIntro: string;
    resetIntro: string;
  };

  e: {
    passwordChanged: {
      subject: string;
      title: string;
      body(date: string): string;
      sessions: string;
      action: string;
    };
    passwordResetRequired: {
      subject: string;
      title: string;
      body: string;
      next: string;
      action: string;
    };
    accountBlocked: {
      subject: string;
      title: string;
      body: string;
      contact: string;
    };
    accountUnblocked: {
      subject: string;
      title: string;
      body: string;
      action: string;
    };
    twoFactorEnabled: { subject: string; title: string; body: string };
    twoFactorDisabled: {
      subject: string;
      title: string;
      body: string;
      action: string;
    };
    invitationAccepted: {
      subject(name: string): string;
      title: string;
      body(name: string): string;
      actionAgents: string;
      actionUsers: string;
    };
    assignmentCreated: {
      subject(c: string): string;
      title: string;
      body(c: string): string;
      bodyReassigned(c: string): string;
    };
    assignmentRemovedReassigned: {
      subject(c: string): string;
      title: string;
      body(c: string): string;
    };
    assignmentCancelled: {
      subject(c: string): string;
      title: string;
      body(c: string, date: string): string;
    };
    rescheduled: {
      subject(c: string): string;
      title: string;
      body(c: string, oldDate: string): string;
    };
    visitUpdated: {
      subject(c: string): string;
      title: string;
      body(c: string, fields: string): string;
    };
    assignmentDeleted: {
      subject(c: string): string;
      title: string;
      body(c: string, date: string): string;
    };
    meetingScheduled: {
      subject(c: string): string;
      title: string;
      titleByAgent: string;
      body(c: string): string;
      bodyByAgent(agent: string, c: string): string;
      bodyReassigned(c: string): string;
    };
    meetingRemoved: {
      subject(c: string): string;
      title: string;
      body(c: string): string;
    };
    meetingCancelledByAgent: {
      subject(c: string): string;
      title: string;
      body(c: string): string;
    };
    actionAssignments: string;
    actionPlanning: string;
    reportSubmitted: {
      subject(c: string): string;
      title: string;
      body(agent: string, c: string): string;
      action: string;
    };
    reportValidated: {
      subject(c: string): string;
      title: string;
      body(c: string): string;
      action: string;
    };
    noteAdded: {
      subject(c: string): string;
      title: string;
      body(author: string, c: string): string;
      action: string;
    };
    reportAnalyzed: {
      subject(c: string): string;
      title: string;
      body(agent: string, c: string): string;
      action: string;
    };
    ticketCreated: {
      subject(ref: string): string;
      title: string;
      body: string;
      action: string;
    };
    ticketUrgent: {
      subject(ref: string, priority: string, s: string): string;
      title: string;
      body(author: string, priority: string): string;
      action: string;
    };
    ticketAssigned: {
      subject(ref: string): string;
      title: string;
      body: string;
      action: string;
    };
    ticketReplied: {
      subject(ref: string): string;
      title: string;
      body(s: string): string;
      action: string;
    };
    ticketResolved: {
      subject(ref: string): string;
      title: string;
      body(s: string): string;
    };
    ticketStatusChanged: {
      subject(ref: string, status: string): string;
      title: string;
      body(s: string): string;
      action: string;
    };
    collectionFailed: {
      subject: string;
      title: string;
      body: string;
      action: string;
    };
    visitReminderEmail: {
      subject(count: number): string;
      title: string;
      body(day: string): string;
      action: string;
    };
    visitTomorrow: {
      title: string;
      body(c: string, time: string): string;
      action: string;
    };
    assignmentDueSoon: { title: string; body(c: string, time: string): string };
    visitImminent: {
      title: string;
      body(c: string, minutes: number): string;
      action: string;
    };
    reportDue: { title: string; body(c: string): string; action: string };
    assignmentOverdue: {
      title: string;
      body(c: string, date: string): string;
      action: string;
    };
    dailyAgenda: {
      title: string;
      body(count: number, time: string, c: string): string;
      action: string;
    };
    newDevice: {
      subject: string;
      title: string;
      body(device: string, browser: string): string;
      advice: string;
      action: string;
    };
    weeklyDigest: {
      subject: string;
      title: string;
      body(day: string): string;
      visits: string;
      reports: string;
      overdue: string;
      unassigned: string;
      action: string;
    };
  };
}

const fr: MailText = {
  locale: 'fr',
  hello: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
  signOff: 'Cordialement,',
  team: 'Equipe DME Orange.',
  footers: {
    default:
      'Cet e-mail a été envoyé automatiquement par la plateforme Orange DME. Merci de ne pas y répondre.',
    security:
      "Cet e-mail de sécurité est envoyé automatiquement. Si vous n'êtes pas à l'origine de cette action, contactez immédiatement un administrateur DME.",
    work: 'Vous recevez cet e-mail car les e-mails d’activité sont activés. Vous pouvez les désactiver dans Paramètres.',
  },
  dateTime: formatter('fr', { dateStyle: 'full', timeStyle: 'short' }),
  day: formatter('fr', { dateStyle: 'full' }),
  time: formatter('fr', { timeStyle: 'short' }),
  shortDate: formatter('fr', { day: 'numeric', month: 'long' }),
  list: (labels) => join('fr', labels),

  label: {
    company: 'Entreprise',
    address: 'Adresse',
    date: 'Date',
    duration: 'Durée',
    visitType: 'Type de visite',
    priority: 'Priorité',
    objectives: 'Objectifs',
    reason: 'Motif',
    subject: 'Sujet',
    place: 'Lieu',
    link: 'Lien',
    visit: 'Visite',
    visitDate: 'Date de la visite',
    name: 'Nom',
    email: 'E-mail',
    role: 'Rôle',
    verdict: 'Verdict',
    nextAction: 'Prochaine action',
    followUp: 'Relance prévue',
    reference: 'Référence',
    type: 'Type',
    status: 'Statut',
    oldStatus: 'Ancien statut',
    newStatus: 'Nouveau statut',
    description: 'Description',
    startedAt: 'Lancée le',
    sources: 'Sources',
    error: 'Erreur',
    device: 'Appareil',
    ipAddress: 'Adresse IP',
  },
  visitType: {
    FIRST_VISIT: 'Première visite',
    FOLLOW_UP: 'Visite de suivi',
    DEMONSTRATION: 'Démonstration',
    CONTRACT: 'Signature de contrat',
    OTHER: 'Autre',
  },
  assignmentPriority: { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' },
  ticketPriority: {
    LOW: 'Basse',
    MEDIUM: 'Moyenne',
    HIGH: 'Haute',
    CRITICAL: 'Critique',
  },
  ticketStatus: {
    NEW: 'Nouveau',
    IN_PROGRESS: 'En cours de traitement',
    RESOLVED: 'Résolu',
  },
  ticketType: {
    TECHNICAL: 'Problème technique',
    CONNECTION: 'Connexion',
    COMPANY: 'Entreprise',
    REPORT: 'Rapport',
    AI: 'Intelligence artificielle',
    VISIT: 'Visite',
    OTHER: 'Autre',
  },
  verdict: {
    QUALIFIED_FOLLOW_UP: 'Qualifié, à relancer',
    PENDING_INFORMATION: 'Informations en attente',
    NOT_ELIGIBLE: 'Non éligible',
    CONVERTED: 'Converti',
  },
  role: { MANAGER: 'Manager DME', AGENT: 'Agent DME' },
  field: {
    company: 'l’entreprise',
    objectives: 'les objectifs',
    visitType: 'le type de visite',
    priority: 'la priorité',
    duration: 'la durée',
    title: 'l’objet',
    agenda: 'l’ordre du jour',
    place: 'le lieu',
    link: 'le lien',
  },
  someone: {
    agent: 'Un agent',
    colleague: 'Un collègue',
    user: 'Un utilisateur',
    yourAgent: 'votre agent',
  },

  code: {
    mfaSubject: 'Votre code de vérification DME',
    resetSubject: 'Votre code de réinitialisation DME',
    title: 'Voici votre code de vérification',
    mfaIntro:
      'Copiez le code ci-dessous, puis saisissez-le pour finaliser votre connexion.',
    resetIntro:
      'Copiez le code ci-dessous, puis saisissez-le pour réinitialiser votre mot de passe.',
  },

  e: {
    passwordChanged: {
      subject: 'Votre mot de passe DME a été modifié',
      title: 'Mot de passe modifié',
      body: (date) =>
        `Le mot de passe de votre compte Orange DME a été modifié le ${date}.`,
      sessions:
        'Par sécurité, toutes vos sessions ouvertes ont été déconnectées.',
      action: 'Se connecter',
    },
    passwordResetRequired: {
      subject: 'Réinitialisation de votre mot de passe requise',
      title: 'Nouveau mot de passe requis',
      body: 'Un administrateur DME a demandé la réinitialisation de votre mot de passe. Vos sessions ouvertes ont été déconnectées.',
      next: 'À votre prochaine connexion, utilisez « Mot de passe oublié » pour recevoir un code et choisir un nouveau mot de passe.',
      action: 'Choisir un mot de passe',
    },
    accountBlocked: {
      subject: 'Votre accès à Orange DME a été suspendu',
      title: 'Accès suspendu',
      body: 'Votre compte Orange DME a été suspendu par un administrateur. Vous ne pouvez plus vous connecter à la plateforme.',
      contact:
        'Si vous pensez qu’il s’agit d’une erreur, contactez votre manager ou un administrateur DME.',
    },
    accountUnblocked: {
      subject: 'Votre accès à Orange DME a été rétabli',
      title: 'Accès rétabli',
      body: 'Votre compte Orange DME est de nouveau actif. Vous pouvez vous connecter avec vos identifiants habituels.',
      action: 'Se connecter',
    },
    twoFactorEnabled: {
      subject: 'Application d’authentification activée',
      title: 'Vérification en deux étapes mise à jour',
      body: 'Une application d’authentification est désormais utilisée pour vérifier vos connexions à Orange DME.',
    },
    twoFactorDisabled: {
      subject: 'Application d’authentification désactivée',
      title: 'Vérification en deux étapes mise à jour',
      body: 'L’application d’authentification a été retirée de votre compte. Vos codes de connexion seront désormais envoyés par e-mail.',
      action: 'Vérifier mes paramètres',
    },
    invitationAccepted: {
      subject: (name) => `${name} a rejoint Orange DME`,
      title: 'Invitation acceptée',
      body: (name) =>
        `${name} a accepté votre invitation et activé son compte.`,
      actionAgents: 'Voir mes agents',
      actionUsers: 'Voir les utilisateurs',
    },
    assignmentCreated: {
      subject: (c) => `Nouvelle visite assignée : ${c}`,
      title: 'Nouvelle visite assignée',
      body: (c) => `Une visite chez ${c} vous a été assignée.`,
      bodyReassigned: (c) => `Une visite chez ${c} vous a été réassignée.`,
    },
    assignmentRemovedReassigned: {
      subject: (c) => `Visite retirée : ${c}`,
      title: 'Visite retirée',
      body: (c) =>
        `La visite chez ${c} a été confiée à un autre agent. Vous n’avez plus à l’effectuer.`,
    },
    assignmentCancelled: {
      subject: (c) => `Visite annulée : ${c}`,
      title: 'Visite annulée',
      body: (c, date) => `La visite chez ${c} prévue le ${date} a été annulée.`,
    },
    rescheduled: {
      subject: (c) => `Visite reprogrammée : ${c}`,
      title: 'Visite reprogrammée',
      body: (c, oldDate) =>
        `La visite chez ${c} a été déplacée. Ancienne date : ${oldDate}.`,
    },
    visitUpdated: {
      subject: (c) => `Visite modifiée : ${c}`,
      title: 'Visite modifiée',
      body: (c, fields) =>
        `Votre visite chez ${c} a été mise à jour : ${fields}.`,
    },
    assignmentDeleted: {
      subject: (c) => `Visite supprimée : ${c}`,
      title: 'Visite supprimée',
      body: (c, date) =>
        `La visite chez ${c} prévue le ${date} a été supprimée de votre planning.`,
    },
    meetingScheduled: {
      subject: (c) => `Nouvelle visite planifiée : ${c}`,
      title: 'Nouvelle visite planifiée',
      titleByAgent: 'Visite planifiée par un agent',
      body: (c) => `Une visite chez ${c} a été ajoutée à votre planning.`,
      bodyByAgent: (agent, c) => `${agent} a planifié une visite chez ${c}.`,
      bodyReassigned: (c) => `Une visite chez ${c} vous a été réassignée.`,
    },
    meetingRemoved: {
      subject: (c) => `Visite retirée : ${c}`,
      title: 'Visite retirée',
      body: (c) => `La visite chez ${c} a été confiée à un autre agent.`,
    },
    meetingCancelledByAgent: {
      subject: (c) => `Visite annulée par l’agent : ${c}`,
      title: 'Visite annulée',
      body: (c) => `L’agent a annulé la visite chez ${c}.`,
    },
    actionAssignments: 'Voir mes assignations',
    actionPlanning: 'Voir mon planning',
    reportSubmitted: {
      subject: (c) => `Compte rendu à valider : ${c}`,
      title: 'Nouveau compte rendu à valider',
      body: (agent, c) =>
        `${agent} a soumis le compte rendu de sa visite chez ${c}.`,
      action: 'Consulter le compte rendu',
    },
    reportValidated: {
      subject: (c) => `Compte rendu validé : ${c}`,
      title: 'Compte rendu validé',
      body: (c) => `Votre compte rendu de la visite chez ${c} a été validé.`,
      action: 'Voir mes visites',
    },
    noteAdded: {
      subject: (c) => `Nouvelle note : ${c}`,
      title: 'Nouvelle note sur un compte rendu',
      body: (author, c) =>
        `${author} a ajouté une note au compte rendu de la visite chez ${c} :`,
      action: 'Voir le compte rendu',
    },
    reportAnalyzed: {
      subject: (c) => `Analyse du rapport de visite : ${c}`,
      title: 'Résultat d’analyse disponible',
      body: (agent, c) =>
        `Le rapport de visite de ${agent} chez ${c} a été analysé.`,
      action: 'Voir les assignations',
    },
    ticketCreated: {
      subject: (ref) => `Ticket ${ref} bien reçu`,
      title: 'Votre ticket a bien été reçu',
      body: 'Merci pour votre signalement. L’équipe d’administration DME va le traiter et vous serez informé(e) de son avancement.',
      action: 'Suivre mes tickets',
    },
    ticketUrgent: {
      subject: (ref, priority, s) =>
        `Ticket ${ref} en priorité ${priority} : ${s}`,
      title: 'Nouveau ticket prioritaire',
      body: (author, priority) =>
        `${author} a ouvert un ticket de priorité ${priority}.`,
      action: 'Traiter le ticket',
    },
    ticketAssigned: {
      subject: (ref) => `Ticket ${ref} vous est assigné`,
      title: 'Ticket assigné',
      body: 'Un ticket vous a été assigné.',
      action: 'Ouvrir les tickets',
    },
    ticketReplied: {
      subject: (ref) => `Nouvelle réponse sur le ticket ${ref}`,
      title: 'Nouvelle réponse à votre ticket',
      body: (s) =>
        `L’équipe d’administration a répondu à votre ticket « ${s} » :`,
      action: 'Voir le ticket',
    },
    ticketResolved: {
      subject: (ref) => `Ticket ${ref} résolu`,
      title: 'Votre ticket est résolu',
      body: (s) =>
        `Votre ticket « ${s} » a été marqué comme résolu. S’il persiste, ouvrez un nouveau ticket.`,
    },
    ticketStatusChanged: {
      subject: (ref, status) => `Ticket ${ref} : ${status}`,
      title: 'Mise à jour de votre ticket',
      body: (s) => `Le statut de votre ticket « ${s} » a changé.`,
      action: 'Voir le ticket',
    },
    collectionFailed: {
      subject: 'Échec de la collecte de données',
      title: 'La collecte a échoué',
      body: 'Une collecte de données que vous avez lancée s’est terminée en erreur. Aucune entreprise n’a été ajoutée ni enrichie.',
      action: 'Voir les sources de données',
    },
    visitReminderEmail: {
      subject: (count) =>
        count > 1
          ? `Rappel : ${count} visites demain`
          : 'Rappel : 1 visite demain',
      title: 'Vos visites de demain',
      body: (day) =>
        `Voici votre planning pour le ${day}. Pensez à préparer vos supports et à vérifier les adresses.`,
      action: 'Voir mon planning',
    },
    visitTomorrow: {
      title: 'Rappel',
      body: (c, time) =>
        `N’oubliez pas votre visite chez ${c} demain à ${time}.`,
      action: 'Voir',
    },
    assignmentDueSoon: {
      title: 'Échéance demain',
      body: (c, time) =>
        `L’assignation ${c} arrive à échéance demain à ${time}.`,
    },
    visitImminent: {
      title: 'Visite imminente',
      body: (c, minutes) =>
        `Votre visite chez ${c} commence dans ${minutes >= 55 ? '1 heure' : `${minutes} minutes`}.`,
      action: 'Voir la visite',
    },
    reportDue: {
      title: 'Compte rendu à compléter',
      body: (c) =>
        `Pensez à compléter le compte rendu de votre visite chez ${c}.`,
      action: 'Compléter le compte rendu',
    },
    assignmentOverdue: {
      title: 'Assignation en retard',
      body: (c, date) => `L’assignation ${c} a dépassé son échéance (${date}).`,
      action: 'Voir mes assignations',
    },
    dailyAgenda: {
      title: 'Programme du jour',
      body: (count, time, c) =>
        `Aujourd’hui : ${count > 1 ? `${count} visites` : '1 visite'}, la première à ${time} chez ${c}.`,
      action: 'Voir mon planning',
    },
    newDevice: {
      subject: 'Nouvelle connexion à votre compte DME',
      title: 'Nouvelle connexion',
      body: (device, browser) =>
        `Nouvelle connexion à votre compte depuis ${device} (${browser}).`,
      advice:
        'Si c’est vous, aucune action n’est nécessaire. Sinon, changez votre mot de passe immédiatement et prévenez un administrateur DME.',
      action: 'Vérifier mes paramètres',
    },
    weeklyDigest: {
      subject: 'Votre résumé DME de la semaine',
      title: 'Résumé de la semaine',
      body: (day) =>
        `Voici ce qui attend votre équipe pour la semaine du ${day}.`,
      visits: 'Visites planifiées cette semaine',
      reports: 'Comptes rendus à valider',
      overdue: 'Assignations en retard',
      unassigned: 'Entreprises sans assignation',
      action: 'Ouvrir le tableau de bord',
    },
  },
};

const en: MailText = {
  locale: 'en',
  hello: (name) => (name ? `Hello ${name},` : 'Hello,'),
  signOff: 'Best regards,',
  team: 'The Orange DME team.',
  footers: {
    default:
      'This email was sent automatically by the Orange DME platform. Please do not reply.',
    security:
      'This security email is sent automatically. If you did not do this, contact a DME administrator immediately.',
    work: 'You receive this email because activity emails are on. You can turn them off in Settings.',
  },
  dateTime: formatter('en', { dateStyle: 'full', timeStyle: 'short' }),
  day: formatter('en', { dateStyle: 'full' }),
  time: formatter('en', { timeStyle: 'short' }),
  shortDate: formatter('en', { day: 'numeric', month: 'long' }),
  list: (labels) => join('en', labels),

  label: {
    company: 'Company',
    address: 'Address',
    date: 'Date',
    duration: 'Duration',
    visitType: 'Visit type',
    priority: 'Priority',
    objectives: 'Objectives',
    reason: 'Reason',
    subject: 'Subject',
    place: 'Place',
    link: 'Link',
    visit: 'Visit',
    visitDate: 'Visit date',
    name: 'Name',
    email: 'Email',
    role: 'Role',
    verdict: 'Verdict',
    nextAction: 'Next action',
    followUp: 'Follow-up',
    reference: 'Reference',
    type: 'Type',
    status: 'Status',
    oldStatus: 'Previous status',
    newStatus: 'New status',
    description: 'Description',
    startedAt: 'Started on',
    sources: 'Sources',
    error: 'Error',
    device: 'Device',
    ipAddress: 'IP address',
  },
  visitType: {
    FIRST_VISIT: 'First visit',
    FOLLOW_UP: 'Follow-up visit',
    DEMONSTRATION: 'Demonstration',
    CONTRACT: 'Contract signing',
    OTHER: 'Other',
  },
  assignmentPriority: { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
  ticketPriority: {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  },
  ticketStatus: {
    NEW: 'New',
    IN_PROGRESS: 'In progress',
    RESOLVED: 'Resolved',
  },
  ticketType: {
    TECHNICAL: 'Technical issue',
    CONNECTION: 'Sign-in',
    COMPANY: 'Company',
    REPORT: 'Report',
    AI: 'Artificial intelligence',
    VISIT: 'Visit',
    OTHER: 'Other',
  },
  verdict: {
    QUALIFIED_FOLLOW_UP: 'Qualified, follow up',
    PENDING_INFORMATION: 'Information pending',
    NOT_ELIGIBLE: 'Not eligible',
    CONVERTED: 'Converted',
  },
  role: { MANAGER: 'DME Manager', AGENT: 'DME Agent' },
  field: {
    company: 'the company',
    objectives: 'the objectives',
    visitType: 'the visit type',
    priority: 'the priority',
    duration: 'the duration',
    title: 'the subject',
    agenda: 'the agenda',
    place: 'the place',
    link: 'the link',
  },
  someone: {
    agent: 'An agent',
    colleague: 'A colleague',
    user: 'A user',
    yourAgent: 'your agent',
  },

  code: {
    mfaSubject: 'Your DME verification code',
    resetSubject: 'Your DME password reset code',
    title: 'Here is your verification code',
    mfaIntro: 'Copy the code below, then enter it to finish signing in.',
    resetIntro: 'Copy the code below, then enter it to reset your password.',
  },

  e: {
    passwordChanged: {
      subject: 'Your DME password was changed',
      title: 'Password changed',
      body: (date) =>
        `The password of your Orange DME account was changed on ${date}.`,
      sessions: 'For your security, all your open sessions were signed out.',
      action: 'Sign in',
    },
    passwordResetRequired: {
      subject: 'Password reset required',
      title: 'New password required',
      body: 'A DME administrator asked you to reset your password. Your open sessions were signed out.',
      next: 'Next time you sign in, use “Forgot password” to get a code and choose a new password.',
      action: 'Choose a password',
    },
    accountBlocked: {
      subject: 'Your Orange DME access was suspended',
      title: 'Access suspended',
      body: 'Your Orange DME account was suspended by an administrator. You can no longer sign in to the platform.',
      contact:
        'If you think this is a mistake, contact your manager or a DME administrator.',
    },
    accountUnblocked: {
      subject: 'Your Orange DME access was restored',
      title: 'Access restored',
      body: 'Your Orange DME account is active again. You can sign in with your usual credentials.',
      action: 'Sign in',
    },
    twoFactorEnabled: {
      subject: 'Authenticator app turned on',
      title: 'Two-step verification updated',
      body: 'An authenticator app now verifies your sign-ins to Orange DME.',
    },
    twoFactorDisabled: {
      subject: 'Authenticator app turned off',
      title: 'Two-step verification updated',
      body: 'The authenticator app was removed from your account. Your sign-in codes will now be sent by email.',
      action: 'Check my settings',
    },
    invitationAccepted: {
      subject: (name) => `${name} joined Orange DME`,
      title: 'Invitation accepted',
      body: (name) =>
        `${name} accepted your invitation and activated their account.`,
      actionAgents: 'See my agents',
      actionUsers: 'See users',
    },
    assignmentCreated: {
      subject: (c) => `New visit assigned: ${c}`,
      title: 'New visit assigned',
      body: (c) => `A visit at ${c} was assigned to you.`,
      bodyReassigned: (c) => `A visit at ${c} was reassigned to you.`,
    },
    assignmentRemovedReassigned: {
      subject: (c) => `Visit removed: ${c}`,
      title: 'Visit removed',
      body: (c) =>
        `The visit at ${c} was given to another agent. You no longer need to do it.`,
    },
    assignmentCancelled: {
      subject: (c) => `Visit cancelled: ${c}`,
      title: 'Visit cancelled',
      body: (c, date) => `The visit at ${c} planned for ${date} was cancelled.`,
    },
    rescheduled: {
      subject: (c) => `Visit rescheduled: ${c}`,
      title: 'Visit rescheduled',
      body: (c, oldDate) =>
        `The visit at ${c} was moved. Previous date: ${oldDate}.`,
    },
    visitUpdated: {
      subject: (c) => `Visit updated: ${c}`,
      title: 'Visit updated',
      body: (c, fields) => `Your visit at ${c} was updated: ${fields}.`,
    },
    assignmentDeleted: {
      subject: (c) => `Visit deleted: ${c}`,
      title: 'Visit deleted',
      body: (c, date) =>
        `The visit at ${c} planned for ${date} was removed from your schedule.`,
    },
    meetingScheduled: {
      subject: (c) => `New visit planned: ${c}`,
      title: 'New visit planned',
      titleByAgent: 'Visit planned by an agent',
      body: (c) => `A visit at ${c} was added to your schedule.`,
      bodyByAgent: (agent, c) => `${agent} planned a visit at ${c}.`,
      bodyReassigned: (c) => `A visit at ${c} was reassigned to you.`,
    },
    meetingRemoved: {
      subject: (c) => `Visit removed: ${c}`,
      title: 'Visit removed',
      body: (c) => `The visit at ${c} was given to another agent.`,
    },
    meetingCancelledByAgent: {
      subject: (c) => `Visit cancelled by the agent: ${c}`,
      title: 'Visit cancelled',
      body: (c) => `The agent cancelled the visit at ${c}.`,
    },
    actionAssignments: 'See my assignments',
    actionPlanning: 'See my schedule',
    reportSubmitted: {
      subject: (c) => `Visit report to validate: ${c}`,
      title: 'New visit report to validate',
      body: (agent, c) =>
        `${agent} submitted the report of their visit at ${c}.`,
      action: 'Open the report',
    },
    reportValidated: {
      subject: (c) => `Visit report validated: ${c}`,
      title: 'Visit report validated',
      body: (c) => `Your report of the visit at ${c} was validated.`,
      action: 'See my visits',
    },
    noteAdded: {
      subject: (c) => `New note: ${c}`,
      title: 'New note on a visit report',
      body: (author, c) =>
        `${author} added a note to the report of the visit at ${c}:`,
      action: 'Open the report',
    },
    reportAnalyzed: {
      subject: (c) => `Visit report analysis: ${c}`,
      title: 'Analysis result available',
      body: (agent, c) => `The visit report of ${agent} at ${c} was analysed.`,
      action: 'See assignments',
    },
    ticketCreated: {
      subject: (ref) => `Ticket ${ref} received`,
      title: 'Your ticket was received',
      body: 'Thank you for reporting it. The DME administration team will handle it and keep you informed.',
      action: 'Follow my tickets',
    },
    ticketUrgent: {
      subject: (ref, priority, s) =>
        `Ticket ${ref}, ${priority} priority: ${s}`,
      title: 'New priority ticket',
      body: (author, priority) =>
        `${author} opened a ${priority} priority ticket.`,
      action: 'Handle the ticket',
    },
    ticketAssigned: {
      subject: (ref) => `Ticket ${ref} is assigned to you`,
      title: 'Ticket assigned',
      body: 'A ticket was assigned to you.',
      action: 'Open tickets',
    },
    ticketReplied: {
      subject: (ref) => `New reply on ticket ${ref}`,
      title: 'New reply to your ticket',
      body: (s) => `The administration team replied to your ticket “${s}”:`,
      action: 'See the ticket',
    },
    ticketResolved: {
      subject: (ref) => `Ticket ${ref} resolved`,
      title: 'Your ticket is resolved',
      body: (s) =>
        `Your ticket “${s}” was marked as resolved. If the problem persists, open a new ticket.`,
    },
    ticketStatusChanged: {
      subject: (ref, status) => `Ticket ${ref}: ${status}`,
      title: 'Your ticket was updated',
      body: (s) => `The status of your ticket “${s}” changed.`,
      action: 'See the ticket',
    },
    collectionFailed: {
      subject: 'Data collection failed',
      title: 'The collection failed',
      body: 'A data collection you started ended with an error. No company was added or enriched.',
      action: 'See data sources',
    },
    visitReminderEmail: {
      subject: (count) =>
        count > 1
          ? `Reminder: ${count} visits tomorrow`
          : 'Reminder: 1 visit tomorrow',
      title: 'Your visits tomorrow',
      body: (day) =>
        `Here is your schedule for ${day}. Remember to prepare your materials and check the addresses.`,
      action: 'See my schedule',
    },
    visitTomorrow: {
      title: 'Reminder',
      body: (c, time) => `Don’t forget your visit at ${c} tomorrow at ${time}.`,
      action: 'See',
    },
    assignmentDueSoon: {
      title: 'Due tomorrow',
      body: (c, time) => `The ${c} assignment is due tomorrow at ${time}.`,
    },
    visitImminent: {
      title: 'Visit coming up',
      body: (c, minutes) =>
        `Your visit at ${c} starts in ${minutes >= 55 ? '1 hour' : `${minutes} minutes`}.`,
      action: 'See the visit',
    },
    reportDue: {
      title: 'Visit report to complete',
      body: (c) => `Remember to complete the report of your visit at ${c}.`,
      action: 'Complete the report',
    },
    assignmentOverdue: {
      title: 'Assignment overdue',
      body: (c, date) => `The ${c} assignment is past its due date (${date}).`,
      action: 'See my assignments',
    },
    dailyAgenda: {
      title: 'Today’s schedule',
      body: (count, time, c) =>
        `Today: ${count > 1 ? `${count} visits` : '1 visit'}, the first at ${time} at ${c}.`,
      action: 'See my schedule',
    },
    newDevice: {
      subject: 'New sign-in to your DME account',
      title: 'New sign-in',
      body: (device, browser) =>
        `New sign-in to your account from ${device} (${browser}).`,
      advice:
        'If this was you, there is nothing to do. Otherwise, change your password now and tell a DME administrator.',
      action: 'Check my settings',
    },
    weeklyDigest: {
      subject: 'Your DME weekly summary',
      title: 'Weekly summary',
      body: (day) =>
        `Here is what is coming up for your team in the week of ${day}.`,
      visits: 'Visits planned this week',
      reports: 'Visit reports to validate',
      overdue: 'Overdue assignments',
      unassigned: 'Companies without assignment',
      action: 'Open the dashboard',
    },
  },
};

export const MAIL_TEXTS: Record<MailLocale, MailText> = { fr, en };

export function mailText(locale: string | null | undefined): MailText {
  return MAIL_TEXTS[mailLocale(locale)];
}
