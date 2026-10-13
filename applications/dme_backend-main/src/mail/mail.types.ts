import type {
  NotificationChannels,
  NotificationEntity,
  NotificationType,
} from '../notifications/notification.types';

/**
 * Content of an event email, rendered with `layouts/base.html`. The same event
 * also becomes an in-app notification: subject as title, first paragraph as
 * body, action path as link.
 */
export interface EventEmail {
  type: NotificationType;
  subject: string;
  title: string;
  /** First name used in "Bonjour <name>,". */
  greeting?: string;
  paragraphs: string[];
  /** Label/value rows shown in a highlighted box. Empty values are skipped. */
  details?: [label: string, value: string | null | undefined][];
  action?: { label: string; url: string };
  footer?: string;
  /** Defaults to 'all' (bell + push + email). */
  channels?: NotificationChannels;
  /** The item the notification is about, for deep links in the apps. */
  entity?: NotificationEntity;
}
