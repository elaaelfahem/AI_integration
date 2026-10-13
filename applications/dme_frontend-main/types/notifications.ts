export interface AppNotification {
  id: string;
  /** e.g. ASSIGNMENT_CREATED, TICKET_REPLIED */
  type: string;
  title: string;
  body: string;
  /** In-app path to open, e.g. /assignments */
  link: string | null;
  /** What it is about: assignment, meeting, visit_report, ticket, user, collection_job */
  entityType: string | null;
  /** Id of that item (for visit_report: the meeting id) */
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  /** Notifications matching the filters */
  total: number;
  /** All unread notifications (badge) */
  unreadCount: number;
}

export const NOTIFICATION_CATEGORIES = [
  'security',
  'team',
  'visits',
  'reports',
  'tickets',
  'data',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationFilters {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: 'all' | 'unread' | 'read';
  category?: NotificationCategory;
}

/** Fired after the notifications page changes read state, so the bell refreshes. */
export const NOTIFICATIONS_CHANGED_EVENT = 'dme:notifications-changed';

/** Per-type email switches (mirrors EMAIL_PREFERENCES on the backend). */
export type EmailPreferenceKey =
  | 'ticketReply'
  | 'ticketAssigned'
  | 'meetingReminder'
  | 'reportSubmitted'
  | 'reportReviewed'
  | 'noteAdded';

/** Who receives each kind of email, so Settings only shows relevant switches. */
export const EMAIL_PREFERENCE_ROLES: Record<
  EmailPreferenceKey,
  readonly ('SUPERADMIN' | 'MANAGER' | 'AGENT')[]
> = {
  ticketReply: ['SUPERADMIN', 'MANAGER', 'AGENT'],
  ticketAssigned: ['SUPERADMIN'],
  meetingReminder: ['AGENT'],
  reportSubmitted: ['MANAGER'],
  reportReviewed: ['AGENT'],
  // Only agents write notes, so only their manager receives them.
  noteAdded: ['MANAGER'],
};
