import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountType,
  AssignmentStatus,
  ConnectionStatus,
  MeetingStatus,
  Prisma,
  TicketPriority,
  UserRole,
  VisitReportStatus,
  type Assignment,
  type ProspectingMeeting,
  type TicketStatus,
} from '@prisma/client';
import type { Transporter } from 'nodemailer';
import {
  MFA_CODE_TTL_SECONDS,
  PASSWORD_RESET_CODE_TTL_SECONDS,
} from '../auth/auth.constants';
import { parseUserAgent } from '../common/utils/user-agent';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import {
  optedOutTypes,
  type NotificationType,
} from '../notifications/notification.types';
import { PrismaService } from '../prisma/prisma.service';
import { findVisits, tunisDay } from '../visits/visits';
import {
  INVITATION_ROLE_LABELS,
  MAIL_LOGO_URL,
  MAIL_SUBJECTS,
} from './mail.constants';
import { mailText, type MailText } from './mail.i18n';
import { ticketReference } from './mail.labels';
import { MailTemplateRenderer } from './mail-template.renderer';
import { MAIL_TRANSPORT } from './mail.tokens';
import type { EventEmail } from './mail.types';

/**
 * security: always sent, even to blocked accounts.
 * work: day-to-day activity, follows `notify_work_updates`.
 * analysis: report analysis results, follows `notify_analysis_results`.
 */
type Category = 'security' | 'work' | 'analysis';

/** An event's content, written in the recipient's language. */
type EmailBuilder = (t: MailText) => EventEmail;

interface Recipient {
  id: string;
  email: string;
  firstName: string;
  fullName: string;
  role: UserRole | 'SUPERADMIN';
  active: boolean;
  notifyWork: boolean;
  notifyAnalysis: boolean;
  /** Notification types whose email this person turned off. */
  optedOut: Set<string>;
  /** Language of their emails and notifications. */
  t: MailText;
}

const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.PENDING,
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.IN_PROGRESS,
];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

interface UpcomingVisit {
  kind: 'meeting' | 'assignment';
  id: string;
  agentId: string;
  company: string;
  address: string | null;
  scheduledAt: Date;
}

/**
 * Every email the platform sends. Login emails (codes, invitation) throw so
 * the caller can report the failure. Event emails load what they need, never
 * throw and never block the caller: call them with `void` after the action.
 *
 * Event emails and their bell/push notifications are written in each
 * recipient's language (`locale`, French by default). Invitations are always
 * in French: the invited account has not chosen a language yet.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly renderer = new MailTemplateRenderer();

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly mailerService: Transporter,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  // Login and invitation

  async sendMfaCode(to: string, code: string): Promise<void> {
    const t = mailText(await this.localeForEmail(to));
    await this.sendVerificationCode(to, code, t, {
      subject: t.code.mfaSubject,
      intro: t.code.mfaIntro,
      ttlSeconds: MFA_CODE_TTL_SECONDS,
    });
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const t = mailText(await this.localeForEmail(to));
    await this.sendVerificationCode(to, code, t, {
      subject: t.code.resetSubject,
      intro: t.code.resetIntro,
      ttlSeconds: PASSWORD_RESET_CODE_TTL_SECONDS,
    });
  }

  async sendInvitation({
    to,
    role,
    invitationUrl,
    temporaryPassword,
    expiresInMinutes,
  }: {
    to: string;
    role: UserRole;
    invitationUrl: string;
    temporaryPassword: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const values = {
      logoUrl: MAIL_LOGO_URL,
      roleLabel: INVITATION_ROLE_LABELS[role],
      invitationUrl,
      temporaryPassword,
      expiresInMinutes,
    };

    await this.mailerService.sendMail({
      to,
      subject: MAIL_SUBJECTS.invitation,
      text: this.renderer.text('invitation.txt', values),
      html: this.renderer.html('invitation.html', values),
    });
  }

  // Security

  passwordChanged(accountId: string) {
    return this.run('passwordChanged', async () => {
      const to = await this.recipient(accountId);
      await this.send(to, 'security', (t) => ({
        type: 'PASSWORD_CHANGED',
        subject: t.e.passwordChanged.subject,
        title: t.e.passwordChanged.title,
        paragraphs: [
          t.e.passwordChanged.body(t.dateTime(new Date())),
          t.e.passwordChanged.sessions,
        ],
        action: { label: t.e.passwordChanged.action, url: this.url('/login') },
      }));
    });
  }

  passwordResetRequired(userId: string) {
    return this.run('passwordResetRequired', async () => {
      const to = await this.recipient(userId);
      await this.send(to, 'security', (t) => ({
        type: 'PASSWORD_RESET_REQUIRED',
        subject: t.e.passwordResetRequired.subject,
        title: t.e.passwordResetRequired.title,
        paragraphs: [
          t.e.passwordResetRequired.body,
          t.e.passwordResetRequired.next,
        ],
        action: {
          label: t.e.passwordResetRequired.action,
          url: this.url('/login'),
        },
      }));
    });
  }

  accountBlocked(userId: string) {
    return this.run('accountBlocked', async () => {
      const to = await this.recipient(userId);
      await this.send(to, 'security', (t) => ({
        type: 'ACCOUNT_BLOCKED',
        subject: t.e.accountBlocked.subject,
        title: t.e.accountBlocked.title,
        paragraphs: [t.e.accountBlocked.body, t.e.accountBlocked.contact],
      }));
    });
  }

  accountUnblocked(userId: string) {
    return this.run('accountUnblocked', async () => {
      const to = await this.recipient(userId);
      await this.send(to, 'security', (t) => ({
        type: 'ACCOUNT_UNBLOCKED',
        subject: t.e.accountUnblocked.subject,
        title: t.e.accountUnblocked.title,
        paragraphs: [t.e.accountUnblocked.body],
        action: { label: t.e.accountUnblocked.action, url: this.url('/login') },
      }));
    });
  }

  twoFactorChanged(accountId: string, enabled: boolean) {
    return this.run('twoFactorChanged', async () => {
      const to = await this.recipient(accountId);
      await this.send(to, 'security', (t) =>
        enabled
          ? {
              type: 'TWO_FACTOR_ENABLED',
              subject: t.e.twoFactorEnabled.subject,
              title: t.e.twoFactorEnabled.title,
              paragraphs: [t.e.twoFactorEnabled.body],
            }
          : {
              type: 'TWO_FACTOR_DISABLED',
              subject: t.e.twoFactorDisabled.subject,
              title: t.e.twoFactorDisabled.title,
              paragraphs: [t.e.twoFactorDisabled.body],
              action: {
                label: t.e.twoFactorDisabled.action,
                url: this.url('/settings'),
              },
            },
      );
    });
  }

  invitationAccepted(inviteId: string) {
    return this.run('invitationAccepted', async () => {
      const invite = await this.prisma.inviteToken.findUnique({
        where: { id: inviteId },
        select: {
          invited_by_id: true,
          role_to_assign: true,
          invited_email: true,
          account_id: true,
          account: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
        },
      });
      if (!invite) return;
      const to = await this.recipient(invite.invited_by_id);
      const user = invite.account?.user;
      const name = user ? `${user.first_name} ${user.last_name}` : null;
      const who = name ?? invite.invited_email;
      const isAgent = invite.role_to_assign === UserRole.AGENT;
      await this.send(to, 'work', (t) => ({
        type: 'INVITATION_ACCEPTED',
        ...(invite.account_id && {
          entity: { type: 'user' as const, id: invite.account_id },
        }),
        subject: t.e.invitationAccepted.subject(who),
        title: t.e.invitationAccepted.title,
        paragraphs: [t.e.invitationAccepted.body(who)],
        details: [
          [t.label.name, name],
          [t.label.email, invite.invited_email],
          [t.label.role, t.role[invite.role_to_assign]],
        ],
        action: {
          label: isAgent
            ? t.e.invitationAccepted.actionAgents
            : t.e.invitationAccepted.actionUsers,
          url: this.url(isAgent ? '/agents' : '/users'),
        },
      }));
    });
  }

  // Assignments

  assignmentCreated(assignmentId: string) {
    return this.run('assignmentCreated', async () => {
      const assignment = await this.loadAssignment(assignmentId);
      if (!assignment) return;
      const company = assignment.company.name;
      await this.sendAssignmentToAgent(
        assignment,
        assignment.agent_id,
        (t) => ({
          type: 'ASSIGNMENT_CREATED',
          subject: t.e.assignmentCreated.subject(company),
          title: t.e.assignmentCreated.title,
          intro: t.e.assignmentCreated.body(company),
        }),
      );
    });
  }

  /** Call after an update made by a manager or admin, with the row before it. */
  assignmentChanged(before: Assignment) {
    return this.run('assignmentChanged', async () => {
      const assignment = await this.loadAssignment(before.id);
      if (!assignment) return;
      const company = assignment.company.name;

      if (assignment.agent_id !== before.agent_id) {
        await this.sendAssignmentToAgent(
          assignment,
          assignment.agent_id,
          (t) => ({
            type: 'ASSIGNMENT_CREATED',
            subject: t.e.assignmentCreated.subject(company),
            title: t.e.assignmentCreated.title,
            intro: t.e.assignmentCreated.bodyReassigned(company),
          }),
        );
        await this.sendAssignmentToAgent(assignment, before.agent_id, (t) => ({
          type: 'ASSIGNMENT_REMOVED',
          subject: t.e.assignmentRemovedReassigned.subject(company),
          title: t.e.assignmentRemovedReassigned.title,
          intro: t.e.assignmentRemovedReassigned.body(company),
          withAction: false,
        }));
        return;
      }

      if (
        assignment.status === AssignmentStatus.CANCELLED &&
        before.status !== AssignmentStatus.CANCELLED
      ) {
        await this.sendAssignmentToAgent(
          assignment,
          assignment.agent_id,
          (t) => ({
            type: 'ASSIGNMENT_CANCELLED',
            subject: t.e.assignmentCancelled.subject(company),
            title: t.e.assignmentCancelled.title,
            intro: t.e.assignmentCancelled.body(
              company,
              t.dateTime(assignment.scheduled_at),
            ),
            reason: assignment.cancellation_reason,
            withAction: false,
          }),
        );
        return;
      }

      if (assignment.scheduled_at.getTime() !== before.scheduled_at.getTime()) {
        await this.sendAssignmentToAgent(
          assignment,
          assignment.agent_id,
          (t) => ({
            type: 'ASSIGNMENT_RESCHEDULED',
            subject: t.e.rescheduled.subject(company),
            title: t.e.rescheduled.title,
            intro: t.e.rescheduled.body(
              company,
              t.dateTime(before.scheduled_at),
            ),
          }),
        );
        return;
      }

      const changed = changedFields([
        [before.company_id !== assignment.company_id, 'company'],
        [before.objectives !== assignment.objectives, 'objectives'],
        [before.visit_type !== assignment.visit_type, 'visitType'],
        [before.priority !== assignment.priority, 'priority'],
        [before.duration_minutes !== assignment.duration_minutes, 'duration'],
      ]);
      if (changed.length) {
        await this.sendAssignmentToAgent(
          assignment,
          assignment.agent_id,
          (t) => ({
            type: 'VISIT_UPDATED',
            subject: t.e.visitUpdated.subject(company),
            title: t.e.visitUpdated.title,
            intro: t.e.visitUpdated.body(
              company,
              t.list(changed.map((field) => t.field[field])),
            ),
          }),
        );
      }
    });
  }

  /** Call before deleting, while the row still exists. */
  assignmentRemoved(assignment: Assignment & { company: { name: string } }) {
    return this.run('assignmentRemoved', async () => {
      if (!OPEN_ASSIGNMENT_STATUSES.includes(assignment.status)) return;
      const to = await this.recipient(assignment.agent_id);
      const company = assignment.company.name;
      await this.send(to, 'work', (t) => ({
        type: 'ASSIGNMENT_REMOVED',
        entity: { type: 'assignment', id: assignment.id },
        subject: t.e.assignmentDeleted.subject(company),
        title: t.e.assignmentDeleted.title,
        paragraphs: [
          t.e.assignmentDeleted.body(
            company,
            t.dateTime(assignment.scheduled_at),
          ),
        ],
      }));
    });
  }

  // Meetings

  meetingScheduled(meetingId: string, actorId: string) {
    return this.run('meetingScheduled', async () => {
      const meeting = await this.loadMeeting(meetingId);
      if (!meeting) return;
      const company = meeting.company.name;
      if (actorId === meeting.agent_id) {
        const agent = await this.recipient(meeting.agent_id);
        await this.sendMeeting(meeting, meeting.manager_id, (t) => ({
          type: 'MEETING_SCHEDULED',
          subject: t.e.meetingScheduled.subject(company),
          title: t.e.meetingScheduled.titleByAgent,
          intro: t.e.meetingScheduled.bodyByAgent(
            agent?.fullName ?? t.someone.agent,
            company,
          ),
        }));
        return;
      }
      await this.sendMeeting(meeting, meeting.agent_id, (t) => ({
        type: 'MEETING_SCHEDULED',
        subject: t.e.meetingScheduled.subject(company),
        title: t.e.meetingScheduled.title,
        intro: t.e.meetingScheduled.body(company),
      }));
    });
  }

  meetingChanged(before: ProspectingMeeting, actorId: string) {
    return this.run('meetingChanged', async () => {
      const meeting = await this.loadMeeting(before.id);
      if (!meeting) return;
      const company = meeting.company.name;
      const cancelled =
        meeting.status === MeetingStatus.CANCELLED &&
        before.status !== MeetingStatus.CANCELLED;

      if (actorId === meeting.agent_id) {
        if (cancelled) {
          await this.sendMeeting(meeting, meeting.manager_id, (t) => ({
            type: 'MEETING_CANCELLED',
            subject: t.e.meetingCancelledByAgent.subject(company),
            title: t.e.meetingCancelledByAgent.title,
            intro: t.e.meetingCancelledByAgent.body(company),
            reason: meeting.cancellation_reason,
          }));
        }
        return;
      }

      if (meeting.agent_id !== before.agent_id) {
        await this.sendMeeting(meeting, meeting.agent_id, (t) => ({
          type: 'MEETING_SCHEDULED',
          subject: t.e.meetingScheduled.subject(company),
          title: t.e.meetingScheduled.title,
          intro: t.e.meetingScheduled.bodyReassigned(company),
        }));
        await this.sendMeeting(meeting, before.agent_id, (t) => ({
          type: 'MEETING_REMOVED',
          subject: t.e.meetingRemoved.subject(company),
          title: t.e.meetingRemoved.title,
          intro: t.e.meetingRemoved.body(company),
          withAction: false,
        }));
        return;
      }

      if (cancelled) {
        await this.sendMeeting(meeting, meeting.agent_id, (t) => ({
          type: 'MEETING_CANCELLED',
          subject: t.e.assignmentCancelled.subject(company),
          title: t.e.assignmentCancelled.title,
          intro: t.e.assignmentCancelled.body(
            company,
            t.dateTime(meeting.scheduled_at),
          ),
          reason: meeting.cancellation_reason,
          withAction: false,
        }));
        return;
      }

      if (meeting.scheduled_at.getTime() !== before.scheduled_at.getTime()) {
        await this.sendMeeting(meeting, meeting.agent_id, (t) => ({
          type: 'MEETING_RESCHEDULED',
          subject: t.e.rescheduled.subject(company),
          title: t.e.rescheduled.title,
          intro: t.e.rescheduled.body(company, t.dateTime(before.scheduled_at)),
        }));
        return;
      }

      const changed = changedFields([
        [before.title !== meeting.title, 'title'],
        [before.agenda !== meeting.agenda, 'agenda'],
        [before.location !== meeting.location, 'place'],
        [before.meeting_url !== meeting.meeting_url, 'link'],
        [before.visit_type !== meeting.visit_type, 'visitType'],
        [before.duration_minutes !== meeting.duration_minutes, 'duration'],
      ]);
      if (changed.length && meeting.status === MeetingStatus.SCHEDULED) {
        await this.sendMeeting(meeting, meeting.agent_id, (t) => ({
          type: 'VISIT_UPDATED',
          subject: t.e.visitUpdated.subject(company),
          title: t.e.visitUpdated.title,
          intro: t.e.visitUpdated.body(
            company,
            t.list(changed.map((field) => t.field[field])),
          ),
        }));
      }
    });
  }

  // Visit reports

  visitReportSubmitted(meetingId: string) {
    return this.run('visitReportSubmitted', async () => {
      const meeting = await this.loadMeeting(meetingId);
      if (!meeting) return;
      const agent = await this.recipient(meeting.agent_id);
      const to = await this.recipient(meeting.manager_id);
      const company = meeting.company.name;
      await this.send(to, 'work', (t) => ({
        type: 'VISIT_REPORT_SUBMITTED',
        entity: { type: 'visit_report', id: meetingId },
        subject: t.e.reportSubmitted.subject(company),
        title: t.e.reportSubmitted.title,
        paragraphs: [
          t.e.reportSubmitted.body(agent?.fullName ?? t.someone.agent, company),
        ],
        details: [
          [t.label.company, company],
          [t.label.visit, meeting.title],
          [t.label.visitDate, t.dateTime(meeting.scheduled_at)],
        ],
        action: {
          label: t.e.reportSubmitted.action,
          url: this.url('/visit-reports'),
        },
      }));
    });
  }

  visitReportReviewed(meetingId: string, status: VisitReportStatus) {
    return this.run('visitReportReviewed', async () => {
      if (status !== VisitReportStatus.VALIDATED) return;
      const meeting = await this.loadMeeting(meetingId);
      if (!meeting) return;
      const to = await this.recipient(meeting.agent_id);
      const company = meeting.company.name;
      await this.send(to, 'work', (t) => ({
        type: 'VISIT_REPORT_VALIDATED',
        entity: { type: 'visit_report', id: meetingId },
        subject: t.e.reportValidated.subject(company),
        title: t.e.reportValidated.title,
        paragraphs: [t.e.reportValidated.body(company)],
        details: [
          [t.label.visit, meeting.title],
          [t.label.visitDate, t.dateTime(meeting.scheduled_at)],
        ],
        action: {
          label: t.e.reportValidated.action,
          url: this.url('/meetings'),
        },
      }));
    });
  }

  /** A note on a visit report goes to the other side (agent or manager). */
  visitReportNoteAdded(meetingId: string, authorId: string, note: string) {
    return this.run('visitReportNoteAdded', async () => {
      const meeting = await this.loadMeeting(meetingId);
      if (!meeting) return;
      const author = await this.recipient(authorId);
      const company = meeting.company.name;
      const recipientIds = [meeting.agent_id, meeting.manager_id].filter(
        (id) => id !== authorId,
      );
      for (const recipientId of new Set(recipientIds)) {
        const to = await this.recipient(recipientId);
        await this.send(to, 'work', (t) => ({
          type: 'VISIT_REPORT_NOTE_ADDED',
          entity: { type: 'visit_report', id: meetingId },
          subject: t.e.noteAdded.subject(company),
          title: t.e.noteAdded.title,
          paragraphs: [
            t.e.noteAdded.body(
              author?.fullName ?? t.someone.colleague,
              company,
            ),
            note,
          ],
          details: [
            [t.label.visit, meeting.title],
            [t.label.visitDate, t.dateTime(meeting.scheduled_at)],
          ],
          action: {
            label: t.e.noteAdded.action,
            url: this.url('/visit-reports'),
          },
        }));
      }
    });
  }

  /** Report analysis on the prospection flow (field reports). */
  fieldReportAnalyzed(fieldReportId: string) {
    return this.run('fieldReportAnalyzed', async () => {
      const report = await this.prisma.fieldReport.findUnique({
        where: { id: fieldReportId },
        select: {
          summary: true,
          next_action: true,
          follow_up_at: true,
          created_by_id: true,
          processing: { select: { verdict: true } },
          prospection: {
            select: {
              assignment_id: true,
              manager_id: true,
              company: { select: { name: true } },
            },
          },
        },
      });
      if (!report) return;
      const verdict = report.processing?.verdict;
      const agent = await this.recipient(report.created_by_id);
      const to = await this.recipient(report.prospection.manager_id);
      const company = report.prospection.company.name;
      await this.send(to, 'analysis', (t) => ({
        type: 'REPORT_ANALYZED',
        entity: { type: 'assignment', id: report.prospection.assignment_id },
        subject: t.e.reportAnalyzed.subject(company),
        title: t.e.reportAnalyzed.title,
        paragraphs: [
          t.e.reportAnalyzed.body(
            agent?.fullName ?? t.someone.yourAgent,
            company,
          ),
        ],
        details: [
          [t.label.company, company],
          [t.label.verdict, verdict ? t.verdict[verdict] : null],
          [t.label.nextAction, report.next_action],
          [
            t.label.followUp,
            report.follow_up_at ? t.dateTime(report.follow_up_at) : null,
          ],
        ],
        action: {
          label: t.e.reportAnalyzed.action,
          url: this.url('/assignments'),
        },
      }));
    });
  }

  // Tickets

  ticketCreated(ticketId: string) {
    return this.run('ticketCreated', async () => {
      const ticket = await this.loadTicket(ticketId);
      if (!ticket) return;
      const reference = ticketReference(ticket.number);
      const author = await this.recipient(ticket.created_by_id);
      const details = (t: MailText): EventEmail['details'] => [
        [t.label.reference, reference],
        [t.label.subject, ticket.subject],
        [t.label.type, t.ticketType[ticket.type]],
        [t.label.priority, t.ticketPriority[ticket.priority]],
      ];

      await this.send(author, 'work', (t) => ({
        type: 'TICKET_CREATED',
        entity: { type: 'ticket', id: ticketId },
        subject: t.e.ticketCreated.subject(reference),
        title: t.e.ticketCreated.title,
        paragraphs: [t.e.ticketCreated.body],
        details: details(t),
        action: { label: t.e.ticketCreated.action, url: this.url('/tickets') },
      }));

      const urgent: TicketPriority[] = [
        TicketPriority.HIGH,
        TicketPriority.CRITICAL,
      ];
      if (!urgent.includes(ticket.priority)) return;
      for (const admin of await this.activeSuperadmins()) {
        await this.send(admin, 'work', (t) => {
          const priority = t.ticketPriority[ticket.priority].toLowerCase();
          return {
            type: 'TICKET_URGENT',
            entity: { type: 'ticket', id: ticketId },
            subject: t.e.ticketUrgent.subject(
              reference,
              priority,
              ticket.subject,
            ),
            title: t.e.ticketUrgent.title,
            paragraphs: [
              t.e.ticketUrgent.body(
                author?.fullName ?? t.someone.user,
                priority,
              ),
            ],
            details: [
              ...(details(t) ?? []),
              [t.label.description, ticket.description],
            ],
            action: {
              label: t.e.ticketUrgent.action,
              url: this.url('/tickets'),
            },
          };
        });
      }
    });
  }

  ticketAssigned(ticketId: string, actorId: string) {
    return this.run('ticketAssigned', async () => {
      const ticket = await this.loadTicket(ticketId);
      if (!ticket?.assigned_to_id || ticket.assigned_to_id === actorId) return;
      const to = await this.recipient(ticket.assigned_to_id);
      const reference = ticketReference(ticket.number);
      await this.send(to, 'work', (t) => ({
        type: 'TICKET_ASSIGNED',
        entity: { type: 'ticket', id: ticketId },
        subject: t.e.ticketAssigned.subject(reference),
        title: t.e.ticketAssigned.title,
        paragraphs: [t.e.ticketAssigned.body],
        details: [
          [t.label.reference, reference],
          [t.label.subject, ticket.subject],
          [t.label.priority, t.ticketPriority[ticket.priority]],
          [t.label.status, t.ticketStatus[ticket.status]],
        ],
        action: { label: t.e.ticketAssigned.action, url: this.url('/tickets') },
      }));
    });
  }

  ticketReplied(ticketId: string, authorId: string, message: string) {
    return this.run('ticketReplied', async () => {
      const ticket = await this.loadTicket(ticketId);
      if (!ticket || ticket.created_by_id === authorId) return;
      const to = await this.recipient(ticket.created_by_id);
      const reference = ticketReference(ticket.number);
      await this.send(to, 'work', (t) => ({
        type: 'TICKET_REPLIED',
        entity: { type: 'ticket', id: ticketId },
        subject: t.e.ticketReplied.subject(reference),
        title: t.e.ticketReplied.title,
        paragraphs: [t.e.ticketReplied.body(ticket.subject), message],
        action: { label: t.e.ticketReplied.action, url: this.url('/tickets') },
      }));
    });
  }

  ticketStatusChanged(ticketId: string, previous: TicketStatus) {
    return this.run('ticketStatusChanged', async () => {
      const ticket = await this.loadTicket(ticketId);
      if (!ticket || ticket.status === previous) return;
      const to = await this.recipient(ticket.created_by_id);
      const reference = ticketReference(ticket.number);
      const resolved = ticket.status === 'RESOLVED';
      await this.send(to, 'work', (t) => ({
        type: 'TICKET_STATUS_CHANGED',
        entity: { type: 'ticket', id: ticketId },
        subject: resolved
          ? t.e.ticketResolved.subject(reference)
          : t.e.ticketStatusChanged.subject(
              reference,
              t.ticketStatus[ticket.status].toLowerCase(),
            ),
        title: resolved
          ? t.e.ticketResolved.title
          : t.e.ticketStatusChanged.title,
        paragraphs: [
          resolved
            ? t.e.ticketResolved.body(ticket.subject)
            : t.e.ticketStatusChanged.body(ticket.subject),
        ],
        details: [
          [t.label.reference, reference],
          [t.label.oldStatus, t.ticketStatus[previous]],
          [t.label.newStatus, t.ticketStatus[ticket.status]],
        ],
        action: {
          label: t.e.ticketStatusChanged.action,
          url: this.url('/tickets'),
        },
      }));
    });
  }

  // Data collection

  collectionJobFailed(jobId: string) {
    return this.run('collectionJobFailed', async () => {
      const job = await this.prisma.collectionJob.findUnique({
        where: { id: jobId },
        select: {
          requested_by_id: true,
          failure_message: true,
          created_at: true,
          sources: { select: { data_source: { select: { name: true } } } },
        },
      });
      if (!job) return;
      const to = await this.recipient(job.requested_by_id);
      await this.send(to, 'work', (t) => ({
        type: 'COLLECTION_JOB_FAILED',
        entity: { type: 'collection_job', id: jobId },
        subject: t.e.collectionFailed.subject,
        title: t.e.collectionFailed.title,
        paragraphs: [t.e.collectionFailed.body],
        details: [
          [t.label.startedAt, t.dateTime(job.created_at)],
          [
            t.label.sources,
            job.sources.map(({ data_source }) => data_source.name).join(', '),
          ],
          [t.label.error, job.failure_message],
        ],
        action: {
          label: t.e.collectionFailed.action,
          url: this.url('/data-sources'),
        },
      }));
    });
  }

  // Scheduled

  /**
   * Evening reminder for tomorrow's visits (visits with their reminder on):
   * one email per agent listing them all, plus one bell/push per visit.
   */
  async sendVisitReminders(now = new Date()) {
    const { start, end } = tunisDay(now, 1);
    const visits = await this.visitsBetween(start, end, {
      reminderOnly: true,
    });

    const visitsByAgent = new Map<string, UpcomingVisit[]>();
    for (const visit of visits) {
      visitsByAgent.set(visit.agentId, [
        ...(visitsByAgent.get(visit.agentId) ?? []),
        visit,
      ]);
    }

    for (const [agentId, agentVisits] of visitsByAgent) {
      await this.run('visitReminder', async () => {
        const to = await this.recipient(agentId);
        await this.send(to, 'work', (t) => ({
          type: 'VISIT_REMINDER',
          channels: 'email',
          subject: t.e.visitReminderEmail.subject(agentVisits.length),
          title: t.e.visitReminderEmail.title,
          paragraphs: [t.e.visitReminderEmail.body(t.day(start))],
          details: agentVisits.map((visit) => [
            t.time(visit.scheduledAt),
            [visit.company, visit.address].filter(Boolean).join(', '),
          ]),
          action: {
            label: t.e.visitReminderEmail.action,
            url: this.url('/meetings'),
          },
        }));

        for (const visit of agentVisits) {
          if (!(await this.claim('VISIT_TOMORROW', visit, agentId))) continue;
          const isAssignment = visit.kind === 'assignment';
          await this.send(to, 'work', (t) => ({
            type: isAssignment ? 'ASSIGNMENT_DUE_SOON' : 'VISIT_TOMORROW',
            channels: 'inbox',
            entity: { type: visit.kind, id: visit.id },
            subject: isAssignment
              ? t.e.assignmentDueSoon.title
              : t.e.visitTomorrow.title,
            title: isAssignment
              ? t.e.assignmentDueSoon.title
              : t.e.visitTomorrow.title,
            paragraphs: [
              isAssignment
                ? t.e.assignmentDueSoon.body(
                    visit.company,
                    t.time(visit.scheduledAt),
                  )
                : t.e.visitTomorrow.body(
                    visit.company,
                    t.time(visit.scheduledAt),
                  ),
            ],
            action: {
              label: t.e.visitTomorrow.action,
              url: this.url(isAssignment ? '/assignments' : '/meetings'),
            },
          }));
        }
      });
    }

    return visitsByAgent.size;
  }

  /** "Visite imminente": bell + push about one hour before each visit. */
  async sendImminentVisitReminders(now = new Date()) {
    const visits = await this.visitsBetween(
      now,
      new Date(now.getTime() + 60 * MINUTE),
      { reminderOnly: true },
    );
    let sent = 0;
    for (const visit of visits) {
      await this.run('visitImminent', async () => {
        if (!(await this.claim('VISIT_IMMINENT', visit, visit.agentId))) {
          return;
        }
        const minutes = Math.max(
          5,
          Math.round(
            (visit.scheduledAt.getTime() - now.getTime()) / MINUTE / 5,
          ) * 5,
        );
        const to = await this.recipient(visit.agentId);
        if (
          await this.send(to, 'work', (t) => ({
            type: 'VISIT_IMMINENT',
            channels: 'inbox',
            entity: { type: visit.kind, id: visit.id },
            subject: t.e.visitImminent.title,
            title: t.e.visitImminent.title,
            paragraphs: [t.e.visitImminent.body(visit.company, minutes)],
            action: {
              label: t.e.visitImminent.action,
              url: this.url(
                visit.kind === 'assignment' ? '/assignments' : '/meetings',
              ),
            },
          }))
        ) {
          sent += 1;
        }
      });
    }
    return sent;
  }

  /**
   * "Compte rendu à compléter" for meetings without a submitted report:
   * 'after-visit' runs every few minutes (2 h after the visit ended, within a
   * day), 'next-morning' runs at 08:00 for yesterday's visits.
   */
  async sendReportDueReminders(
    phase: 'after-visit' | 'next-morning',
    now = new Date(),
  ) {
    const today = tunisDay(now, 0).start;
    const candidates = await this.prisma.prospectingMeeting.findMany({
      where: {
        status: {
          in: [
            MeetingStatus.SCHEDULED,
            MeetingStatus.IN_PROGRESS,
            MeetingStatus.COMPLETED,
          ],
        },
        // Wide window, refined on the end time below.
        scheduled_at: {
          gte: new Date(today.getTime() - 2 * DAY),
          lt: now,
        },
        OR: [{ report: null }, { report: { status: VisitReportStatus.DRAFT } }],
      },
      include: { company: { select: { name: true } } },
    });

    const due = candidates.filter((meeting) => {
      const end =
        meeting.scheduled_at.getTime() + meeting.duration_minutes * MINUTE;
      return phase === 'after-visit'
        ? end <= now.getTime() - 2 * 60 * MINUTE &&
            end > now.getTime() - 26 * 60 * MINUTE
        : end >= today.getTime() - DAY && end < today.getTime();
    });

    for (const meeting of due) {
      await this.run('reportDue', async () => {
        const visit = {
          id: meeting.id,
          scheduledAt: meeting.scheduled_at,
        };
        if (
          !(await this.claim(`REPORT_DUE:${phase}`, visit, meeting.agent_id))
        ) {
          return;
        }
        const to = await this.recipient(meeting.agent_id);
        await this.send(to, 'work', (t) => ({
          type: 'REPORT_DUE',
          channels: 'inbox',
          entity: { type: 'visit_report', id: meeting.id },
          subject: t.e.reportDue.title,
          title: t.e.reportDue.title,
          paragraphs: [t.e.reportDue.body(meeting.company.name)],
          action: {
            label: t.e.reportDue.action,
            url: this.url('/visit-reports'),
          },
        }));
      });
    }
    return due.length;
  }

  /** "Assignation en retard": the morning after a missed assignment. */
  async sendOverdueAssignments(now = new Date()) {
    const today = tunisDay(now, 0).start;
    const overdue = await this.prisma.assignment.findMany({
      where: {
        status: { in: OPEN_ASSIGNMENT_STATUSES },
        scheduled_at: { gte: new Date(today.getTime() - 7 * DAY), lt: today },
      },
      include: { company: { select: { name: true } } },
    });
    for (const assignment of overdue) {
      await this.run('assignmentOverdue', async () => {
        const visit = {
          id: assignment.id,
          scheduledAt: assignment.scheduled_at,
        };
        if (
          !(await this.claim('ASSIGNMENT_OVERDUE', visit, assignment.agent_id))
        ) {
          return;
        }
        const to = await this.recipient(assignment.agent_id);
        await this.send(to, 'work', (t) => ({
          type: 'ASSIGNMENT_OVERDUE',
          channels: 'inbox',
          entity: { type: 'assignment', id: assignment.id },
          subject: t.e.assignmentOverdue.title,
          title: t.e.assignmentOverdue.title,
          paragraphs: [
            t.e.assignmentOverdue.body(
              assignment.company.name,
              t.shortDate(assignment.scheduled_at),
            ),
          ],
          action: {
            label: t.e.assignmentOverdue.action,
            url: this.url('/assignments'),
          },
        }));
      });
    }
    return overdue.length;
  }

  /** "Programme du jour": a push-only summary at 08:00 on days with visits. */
  async sendDailyAgenda(now = new Date()) {
    const { start, end } = tunisDay(now, 0);
    const visits = await this.visitsBetween(start, end, {
      reminderOnly: false,
    });
    const byAgent = new Map<string, UpcomingVisit[]>();
    for (const visit of visits) {
      byAgent.set(visit.agentId, [
        ...(byAgent.get(visit.agentId) ?? []),
        visit,
      ]);
    }
    for (const [agentId, agentVisits] of byAgent) {
      await this.run('dailyAgenda', async () => {
        const marker = { id: agentId, scheduledAt: start };
        if (!(await this.claim('DAILY_AGENDA', marker, agentId))) return;
        const first = agentVisits[0];
        const to = await this.recipient(agentId);
        await this.send(to, 'work', (t) => ({
          type: 'DAILY_AGENDA',
          channels: 'push',
          subject: t.e.dailyAgenda.title,
          title: t.e.dailyAgenda.title,
          paragraphs: [
            t.e.dailyAgenda.body(
              agentVisits.length,
              t.time(first.scheduledAt),
              first.company,
            ),
          ],
          action: { label: t.e.dailyAgenda.action, url: this.url('/meetings') },
        }));
      });
    }
    return byAgent.size;
  }

  /**
   * "Nouvelle connexion" when an account signs in from a device (OS and
   * browser) it has not used in the last 180 days. `before` excludes the
   * login being recorded right now.
   */
  newDeviceLogin(
    accountId: string,
    userAgent: string | undefined,
    ipAddress: string | undefined,
    before: Date,
  ) {
    return this.run('newDeviceLogin', async () => {
      const device = parseUserAgent(userAgent);
      const previous = await this.prisma.connectionEvent.findMany({
        where: {
          account_id: accountId,
          status: ConnectionStatus.SUCCESS,
          created_at: {
            lt: before,
            gte: new Date(before.getTime() - 180 * DAY),
          },
        },
        select: { user_agent: true },
        take: 200,
        orderBy: { created_at: 'desc' },
      });
      // First login ever: nothing to compare with.
      if (previous.length === 0) return;
      const known = previous.some((event) => {
        const seen = parseUserAgent(event.user_agent);
        return seen.device === device.device && seen.browser === device.browser;
      });
      if (known) return;

      const to = await this.recipient(accountId);
      await this.send(to, 'security', (t) => ({
        type: 'NEW_DEVICE_LOGIN',
        subject: t.e.newDevice.subject,
        title: t.e.newDevice.title,
        paragraphs: [
          t.e.newDevice.body(device.device, device.browser),
          t.e.newDevice.advice,
        ],
        details: [
          [t.label.date, t.dateTime(before)],
          [t.label.device, `${device.device}, ${device.browser}`],
          [t.label.ipAddress, ipAddress],
        ],
        action: { label: t.e.newDevice.action, url: this.url('/settings') },
      }));
    });
  }

  /** Monday summary for each active manager. Skipped when there is nothing to report. */
  async sendManagerWeeklyDigest(now = new Date()) {
    const { start } = tunisDay(now, 0);
    const weekEnd = new Date(start.getTime() + 7 * DAY);
    const managers = await this.prisma.user.findMany({
      where: { role: UserRole.MANAGER, status: 'ACTIVE' },
      select: { id: true },
    });
    let sent = 0;

    for (const { id } of managers) {
      await this.run('managerWeeklyDigest', async () => {
        const [visitsThisWeek, reportsToReview, overdue, unassigned] =
          await Promise.all([
            this.prisma.prospectingMeeting.count({
              where: {
                manager_id: id,
                status: MeetingStatus.SCHEDULED,
                scheduled_at: { gte: start, lt: weekEnd },
              },
            }),
            this.prisma.visitReport.count({
              where: {
                meeting: { manager_id: id },
                status: {
                  in: [
                    VisitReportStatus.SUBMITTED,
                    VisitReportStatus.IN_REVIEW,
                  ],
                },
              },
            }),
            this.prisma.assignment.count({
              where: {
                manager_id: id,
                status: { in: OPEN_ASSIGNMENT_STATUSES },
                scheduled_at: { lt: start },
              },
            }),
            this.prisma.company.count({
              where: {
                manager_id: id,
                status: 'ACTIVE',
                assignments: {
                  none: { status: { not: AssignmentStatus.CANCELLED } },
                },
              },
            }),
          ]);
        if (!visitsThisWeek && !reportsToReview && !overdue) return;
        const to = await this.recipient(id);
        if (
          await this.send(to, 'work', (t) => ({
            type: 'WEEKLY_DIGEST',
            subject: t.e.weeklyDigest.subject,
            title: t.e.weeklyDigest.title,
            paragraphs: [t.e.weeklyDigest.body(t.day(start))],
            details: [
              [t.e.weeklyDigest.visits, String(visitsThisWeek)],
              [t.e.weeklyDigest.reports, String(reportsToReview)],
              [t.e.weeklyDigest.overdue, String(overdue)],
              [t.e.weeklyDigest.unassigned, String(unassigned)],
            ],
            action: {
              label: t.e.weeklyDigest.action,
              url: this.url('/dashboard'),
            },
          }))
        ) {
          sent += 1;
        }
      });
    }

    return sent;
  }

  // Helpers

  private async sendAssignmentToAgent(
    assignment: NonNullable<Awaited<ReturnType<typeof this.loadAssignment>>>,
    agentId: string,
    build: (t: MailText) => VisitMessage,
  ) {
    const to = await this.recipient(agentId);
    await this.send(to, 'work', (t) => {
      const message = build(t);
      return {
        type: message.type,
        entity: { type: 'assignment', id: assignment.id },
        subject: message.subject,
        title: message.title,
        paragraphs: [message.intro],
        details: [
          [t.label.company, assignment.company.name],
          [t.label.address, assignment.company.address],
          [t.label.date, t.dateTime(assignment.scheduled_at)],
          [t.label.duration, `${assignment.duration_minutes} min`],
          [t.label.visitType, t.visitType[assignment.visit_type]],
          [t.label.priority, t.assignmentPriority[assignment.priority]],
          [t.label.objectives, assignment.objectives],
          [t.label.reason, message.reason],
        ],
        action:
          message.withAction === false
            ? undefined
            : { label: t.e.actionAssignments, url: this.url('/assignments') },
      };
    });
  }

  private async sendMeeting(
    meeting: NonNullable<Awaited<ReturnType<typeof this.loadMeeting>>>,
    recipientId: string,
    build: (t: MailText) => VisitMessage,
  ) {
    const to = await this.recipient(recipientId);
    await this.send(to, 'work', (t) => {
      const message = build(t);
      return {
        type: message.type,
        entity: { type: 'meeting', id: meeting.id },
        subject: message.subject,
        title: message.title,
        paragraphs: [message.intro],
        details: [
          [t.label.company, meeting.company.name],
          [t.label.subject, meeting.title],
          [t.label.date, t.dateTime(meeting.scheduled_at)],
          [t.label.duration, `${meeting.duration_minutes} min`],
          [t.label.visitType, t.visitType[meeting.visit_type]],
          [t.label.place, meeting.location ?? meeting.company.address],
          [t.label.link, meeting.meeting_url],
          [t.label.reason, message.reason],
        ],
        action:
          message.withAction === false
            ? undefined
            : { label: t.e.actionPlanning, url: this.url('/meetings') },
      };
    });
  }

  /** Upcoming visits in [from, to): scheduled meetings and open assignments. */
  private async visitsBetween(
    from: Date,
    to: Date,
    { reminderOnly }: { reminderOnly: boolean },
  ): Promise<UpcomingVisit[]> {
    const visits = await findVisits(this.prisma, { from, to, reminderOnly });
    return visits.map((visit) => ({
      kind: visit.kind,
      id: visit.id,
      agentId: visit.agentId,
      company: visit.company.name,
      address: visit.company.address,
      scheduledAt: visit.scheduledAt,
    }));
  }

  /**
   * Records that a scheduled notification went out. Returns false when it
   * already did, so each reminder is sent once (also across restarts).
   */
  private async claim(
    kind: string,
    item: { id: string; scheduledAt: Date },
    accountId: string,
  ) {
    try {
      await this.prisma.scheduledNotificationLog.create({
        data: {
          kind,
          entity_id: item.id,
          account_id: accountId,
          occurrence: item.scheduledAt.toISOString(),
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private loadAssignment(id: string) {
    return this.prisma.assignment.findUnique({
      where: { id },
      include: { company: { select: { name: true, address: true } } },
    });
  }

  private loadMeeting(id: string) {
    return this.prisma.prospectingMeeting.findUnique({
      where: { id },
      include: { company: { select: { name: true, address: true } } },
    });
  }

  private loadTicket(id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      select: {
        number: true,
        subject: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        created_by_id: true,
        assigned_to_id: true,
      },
    });
  }

  /** Language of the account behind an email address (French if unknown). */
  private async localeForEmail(email: string) {
    const where = { email: { equals: email, mode: 'insensitive' as const } };
    const user = await this.prisma.user.findFirst({
      where,
      select: { locale: true },
    });
    if (user) return user.locale;
    const admin = await this.prisma.superadmin.findFirst({
      where,
      select: { locale: true },
    });
    return admin?.locale;
  }

  private async recipient(accountId: string): Promise<Recipient | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        account_type: true,
        user: {
          select: {
            email: true,
            first_name: true,
            last_name: true,
            role: true,
            status: true,
            notify_work_updates: true,
            notify_analysis_results: true,
            email_opt_outs: true,
            locale: true,
          },
        },
        superadmin: {
          select: {
            email: true,
            first_name: true,
            last_name: true,
            status: true,
            notify_work_updates: true,
            notify_analysis_results: true,
            email_opt_outs: true,
            locale: true,
          },
        },
      },
    });
    const person =
      account?.account_type === AccountType.SUPERADMIN
        ? account.superadmin
        : account?.user;
    if (!account || !person) return null;

    return {
      id: accountId,
      email: person.email,
      firstName: person.first_name,
      fullName: `${person.first_name} ${person.last_name}`,
      role: account.user?.role ?? 'SUPERADMIN',
      active: person.status === 'ACTIVE',
      notifyWork: person.notify_work_updates,
      notifyAnalysis: person.notify_analysis_results,
      optedOut: optedOutTypes(person.email_opt_outs),
      t: mailText(person.locale),
    };
  }

  private async activeSuperadmins() {
    const admins = await this.prisma.superadmin.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const recipients = await Promise.all(
      admins.map(({ id }) => this.recipient(id)),
    );
    return recipients.filter((r): r is Recipient => r !== null);
  }

  /**
   * Builds the content in the recipient's language, records the in-app
   * notification, then sends the email if their preferences allow it.
   * Returns whether an email was actually sent.
   */
  private async send(
    to: Recipient | null,
    category: Category,
    build: EmailBuilder,
  ) {
    if (!to) return false;
    if (category !== 'security' && !to.active) return false;
    const email = build(to.t);

    const channels = email.channels ?? 'all';
    if (channels === 'push') {
      if (to.active) {
        await this.push.sendToAccount(to.id, {
          notificationId: '',
          type: email.type,
          title: email.subject,
          body: email.paragraphs[0] ?? email.title,
          link: this.linkOf(email),
          entityType: email.entity?.type,
          entityId: email.entity?.id,
        });
      }
      return false;
    }
    if (to.active && channels !== 'email') await this.notify(to.id, email);
    if (channels === 'inbox') return false;

    if (category === 'work' && !to.notifyWork) return false;
    if (category === 'analysis' && !to.notifyAnalysis) return false;
    if (category !== 'security' && to.optedOut.has(email.type)) return false;

    await this.deliver(to.email, to.t, {
      greeting: to.firstName,
      footer:
        category === 'security' ? to.t.footers.security : to.t.footers.work,
      ...email,
    });
    return true;
  }

  /** The bell entry. A failure here must not stop the email. */
  private async notify(accountId: string, email: EventEmail) {
    try {
      await this.notifications.create(accountId, {
        type: email.type,
        title: email.subject,
        body: email.paragraphs[0] ?? email.title,
        link: this.linkOf(email),
        entity: email.entity,
      });
    } catch (error) {
      this.logger.error(
        `Notification "${email.type}" could not be saved`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** In-app path of the email's button, e.g. /assignments. */
  private linkOf(email: EventEmail) {
    const base = this.url('');
    const path = email.action?.url.startsWith(base)
      ? email.action.url.slice(base.length) || '/'
      : null;
    // Signed-in users never need the login page from the bell.
    return path === '/login' ? null : path;
  }

  private async run(name: string, task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      this.logger.error(
        `Email "${name}" could not be sent`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private url(path: string) {
    const base = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return `${base.replace(/\/$/, '')}${path}`;
  }

  private async deliver(
    to: string,
    t: MailText,
    email: EventEmail,
  ): Promise<void> {
    const footer = email.footer ?? t.footers.default;
    const paragraphs = [t.hello(email.greeting), ...email.paragraphs];
    const details = (email.details ?? []).filter(
      (row): row is [string, string] => Boolean(row[1]),
    );

    const content = [
      ...paragraphs.map((text) =>
        this.renderer.html('partials/paragraph.html', { text }),
      ),
      details.length
        ? this.renderer.html(
            'partials/details.html',
            {
              rows: details
                .map(([label, value]) =>
                  this.renderer.html('partials/detail-row.html', {
                    label,
                    value,
                  }),
                )
                .join(''),
            },
            ['rows'],
          )
        : '',
      email.action
        ? this.renderer.html('partials/action-button.html', email.action)
        : '',
    ].join('');

    const separator = t.locale === 'fr' ? ' : ' : ': ';
    const body = [
      paragraphs.join('\n\n'),
      details
        .map(([label, value]) => `${label}${separator}${value}`)
        .join('\n'),
      email.action
        ? `${email.action.label}${separator}${email.action.url}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const layout = { lang: t.locale, signOff: t.signOff, team: t.team, footer };
    await this.mailerService.sendMail({
      to,
      subject: email.subject,
      text: this.renderer.text('event.txt', {
        title: email.title,
        body,
        ...layout,
      }),
      html: this.renderer.html(
        'layouts/base.html',
        { logoUrl: MAIL_LOGO_URL, title: email.title, content, ...layout },
        ['content'],
      ),
    });
  }

  private async sendVerificationCode(
    to: string,
    code: string,
    t: MailText,
    {
      subject,
      intro,
      ttlSeconds,
    }: { subject: string; intro: string; ttlSeconds: number },
  ) {
    const values = {
      logoUrl: MAIL_LOGO_URL,
      title: t.code.title,
      intro,
      code,
      codeBoxes: this.renderCodeBoxes(code),
      expiresInMinutes: Math.round(ttlSeconds / 60),
    };
    const template =
      t.locale === 'en' ? 'verification-code.en' : 'verification-code';

    await this.mailerService.sendMail({
      to,
      subject,
      text: this.renderer.text(`${template}.txt`, values),
      html: this.renderer.html(`${template}.html`, values, ['codeBoxes']),
    });
  }

  private renderCodeBoxes(code: string) {
    return code
      .split('')
      .map((digit) => this.renderer.html('partials/code-digit.html', { digit }))
      .join('');
  }
}

/** What an assignment / meeting email says, before the visit details. */
interface VisitMessage {
  type: NotificationType;
  subject: string;
  title: string;
  intro: string;
  reason?: string | null;
  withAction?: boolean;
}

type ChangedField = keyof MailText['field'];

/** The fields that changed, in a stable order. */
function changedFields(fields: [changed: boolean, field: ChangedField][]) {
  return fields.filter(([changed]) => changed).map(([, field]) => field);
}
