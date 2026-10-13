import {
  AssignmentStatus,
  MeetingStatus,
  type AssignmentPriority,
  type VisitType,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A "visit" exists in two tables: meetings (`prospecting_meetings`, the
 * calendar) and assignments (`assignments`, the prospection flow). These
 * helpers read both as one list.
 */

export const TUNIS_TIME_ZONE = 'Africa/Tunis';
/** Tunisia is UTC+1 all year (no daylight saving time). */
const TUNIS_OFFSET = '+01:00';
const DAY_MS = 24 * 3600 * 1000;

/** Start and end of a calendar day in Tunis, `offsetDays` from `now`'s day. */
export function tunisDay(now: Date, offsetDays = 0) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TUNIS_TIME_ZONE,
  }).format(now);
  const start = new Date(
    new Date(`${ymd}T00:00:00${TUNIS_OFFSET}`).getTime() + offsetDays * DAY_MS,
  );
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Monday 00:00 to next Monday 00:00 (Tunis) of the week containing `now`. */
export function tunisWeek(now: Date) {
  const { start: today } = tunisDay(now);
  const weekday = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: TUNIS_TIME_ZONE,
  }).format(now);
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    weekday,
  );
  const start = new Date(today.getTime() - sinceMonday * DAY_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** First day of the month (Tunis) for "YYYY-MM", and the first of the next. */
export function tunisMonth(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = monthIndex === 12 ? [year + 1, 1] : [year, monthIndex + 1];
  return {
    start: new Date(`${year}-${pad(monthIndex)}-01T00:00:00${TUNIS_OFFSET}`),
    end: new Date(`${next[0]}-${pad(next[1])}-01T00:00:00${TUNIS_OFFSET}`),
  };
}

export const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.PENDING,
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.IN_PROGRESS,
];

/** Who the visits belong to. Empty means everyone (superadmin). */
export interface VisitScope {
  agentId?: string;
  managerId?: string;
}

export function visitScopeFor(actorId: string, role: string): VisitScope {
  if (role === 'AGENT') return { agentId: actorId };
  if (role === 'MANAGER') return { managerId: actorId };
  return {};
}

export interface Visit {
  kind: 'meeting' | 'assignment';
  id: string;
  agentId: string;
  managerId: string;
  company: {
    id: string;
    name: string;
    address: string | null;
    governorate: string | null;
  };
  scheduledAt: Date;
  durationMinutes: number;
  status: MeetingStatus | AssignmentStatus;
  visitType: VisitType;
  /** Assignments only. */
  priority: AssignmentPriority | null;
  reminderEnabled: boolean;
}

export interface FindVisitsOptions {
  scope?: VisitScope;
  from?: Date;
  to?: Date;
  meetingStatuses?: MeetingStatus[];
  assignmentStatuses?: AssignmentStatus[];
  reminderOnly?: boolean;
}

/**
 * Meetings and assignments as one list, sorted by date. A visit stored both
 * as a meeting and as an assignment (same agent, company and time) is listed
 * once, as the meeting.
 */
export async function findVisits(
  prisma: PrismaService,
  {
    scope = {},
    from,
    to,
    meetingStatuses = [MeetingStatus.SCHEDULED],
    assignmentStatuses = OPEN_ASSIGNMENT_STATUSES,
    reminderOnly = false,
  }: FindVisitsOptions = {},
): Promise<Visit[]> {
  const where = {
    ...(scope.agentId && { agent_id: scope.agentId }),
    ...(scope.managerId && { manager_id: scope.managerId }),
    ...((from || to) && {
      scheduled_at: { ...(from && { gte: from }), ...(to && { lt: to }) },
    }),
    ...(reminderOnly && { reminder_enabled: true }),
  };
  const company = {
    select: { id: true, name: true, address: true, governorate: true },
  };
  const [meetings, assignments] = await Promise.all([
    meetingStatuses.length
      ? prisma.prospectingMeeting.findMany({
          where: { ...where, status: { in: meetingStatuses } },
          include: { company },
        })
      : [],
    assignmentStatuses.length
      ? prisma.assignment.findMany({
          where: { ...where, status: { in: assignmentStatuses } },
          include: { company },
        })
      : [],
  ]);

  const seen = new Set<string>();
  const visits: Visit[] = [];
  const add = (visit: Visit) => {
    const key = `${visit.agentId}|${visit.company.id}|${visit.scheduledAt.getTime()}`;
    if (seen.has(key)) return;
    seen.add(key);
    visits.push(visit);
  };
  for (const row of meetings) {
    add({
      kind: 'meeting',
      id: row.id,
      agentId: row.agent_id,
      managerId: row.manager_id,
      company: row.company,
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      status: row.status,
      visitType: row.visit_type,
      priority: null,
      reminderEnabled: row.reminder_enabled,
    });
  }
  for (const row of assignments) {
    add({
      kind: 'assignment',
      id: row.id,
      agentId: row.agent_id,
      managerId: row.manager_id,
      company: row.company,
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      status: row.status,
      visitType: row.visit_type,
      priority: row.priority,
      reminderEnabled: row.reminder_enabled,
    });
  }
  return visits.sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );
}

/** API shape of a visit. */
export function visitView(visit: Visit) {
  return {
    kind: visit.kind,
    id: visit.id,
    company: visit.company,
    scheduledAt: visit.scheduledAt.toISOString(),
    durationMinutes: visit.durationMinutes,
    status: visit.status,
    visitType: visit.visitType,
    priority: visit.priority,
  };
}
