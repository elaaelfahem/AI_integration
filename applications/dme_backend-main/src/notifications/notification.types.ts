/** Every kind of in-app/push notification. Stored as text in `notifications.type`. */
export const NOTIFICATION_TYPES = [
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUIRED',
  'ACCOUNT_BLOCKED',
  'ACCOUNT_UNBLOCKED',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'INVITATION_ACCEPTED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_RESCHEDULED',
  'ASSIGNMENT_CANCELLED',
  'ASSIGNMENT_REMOVED',
  'MEETING_SCHEDULED',
  'MEETING_RESCHEDULED',
  'MEETING_CANCELLED',
  'MEETING_REMOVED',
  'VISIT_REPORT_SUBMITTED',
  'VISIT_REPORT_VALIDATED',
  'VISIT_REPORT_NOTE_ADDED',
  'REPORT_ANALYZED',
  'TICKET_CREATED',
  'TICKET_URGENT',
  'TICKET_ASSIGNED',
  'TICKET_REPLIED',
  'TICKET_STATUS_CHANGED',
  'COLLECTION_JOB_FAILED',
  'VISIT_REMINDER',
  'WEEKLY_DIGEST',
  'VISIT_IMMINENT',
  'VISIT_TOMORROW',
  'VISIT_UPDATED',
  'ASSIGNMENT_DUE_SOON',
  'ASSIGNMENT_OVERDUE',
  'REPORT_DUE',
  'DAILY_AGENDA',
  'NEW_DEVICE_LOGIN',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Groups used by the notification filters. */
export const NOTIFICATION_CATEGORIES = {
  security: [
    'PASSWORD_CHANGED',
    'PASSWORD_RESET_REQUIRED',
    'ACCOUNT_BLOCKED',
    'ACCOUNT_UNBLOCKED',
    'TWO_FACTOR_ENABLED',
    'TWO_FACTOR_DISABLED',
    'NEW_DEVICE_LOGIN',
  ],
  team: ['INVITATION_ACCEPTED'],
  visits: [
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_RESCHEDULED',
    'ASSIGNMENT_CANCELLED',
    'ASSIGNMENT_REMOVED',
    'MEETING_SCHEDULED',
    'MEETING_RESCHEDULED',
    'MEETING_CANCELLED',
    'MEETING_REMOVED',
    'VISIT_REMINDER',
    'VISIT_IMMINENT',
    'VISIT_TOMORROW',
    'VISIT_UPDATED',
    'ASSIGNMENT_DUE_SOON',
    'ASSIGNMENT_OVERDUE',
    'DAILY_AGENDA',
  ],
  reports: [
    'VISIT_REPORT_SUBMITTED',
    'VISIT_REPORT_VALIDATED',
    'VISIT_REPORT_NOTE_ADDED',
    'REPORT_ANALYZED',
    'WEEKLY_DIGEST',
    'REPORT_DUE',
  ],
  tickets: [
    'TICKET_CREATED',
    'TICKET_URGENT',
    'TICKET_ASSIGNED',
    'TICKET_REPLIED',
    'TICKET_STATUS_CHANGED',
  ],
  data: ['COLLECTION_JOB_FAILED'],
} as const satisfies Record<string, readonly NotificationType[]>;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

/**
 * Per-type email switches shown in Settings. Each key turns off the emails of
 * its types; the bell notification is still created. Security emails cannot
 * be turned off.
 */
export const EMAIL_PREFERENCES = {
  ticketReply: ['TICKET_REPLIED', 'TICKET_STATUS_CHANGED'],
  ticketAssigned: ['TICKET_ASSIGNED'],
  meetingReminder: ['VISIT_REMINDER'],
  reportSubmitted: ['VISIT_REPORT_SUBMITTED'],
  reportReviewed: ['VISIT_REPORT_VALIDATED'],
  noteAdded: ['VISIT_REPORT_NOTE_ADDED'],
} as const satisfies Record<string, readonly NotificationType[]>;

export type EmailPreferenceKey = keyof typeof EMAIL_PREFERENCES;

export const EMAIL_PREFERENCE_KEYS = Object.keys(
  EMAIL_PREFERENCES,
) as EmailPreferenceKey[];

/** Types whose email a user turned off, from their stored opt-out keys. */
export function optedOutTypes(optOuts: readonly string[] = []) {
  return new Set<string>(
    optOuts.flatMap((key) =>
      key in EMAIL_PREFERENCES
        ? [...EMAIL_PREFERENCES[key as EmailPreferenceKey]]
        : [],
    ),
  );
}

/** What a notification is about, so apps can open that exact item. */
export const NOTIFICATION_ENTITY_TYPES = [
  'assignment',
  'meeting',
  'visit_report',
  'ticket',
  'user',
  'collection_job',
] as const;

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

export interface NotificationEntity {
  type: NotificationEntityType;
  /** For visit_report this is the meeting id (reports are read by meeting). */
  id: string;
}

/**
 * Where an event goes. all: bell + push + email. inbox: bell + push.
 * email: email only. push: push only (nothing stored).
 */
export type NotificationChannels = 'all' | 'inbox' | 'email' | 'push';
