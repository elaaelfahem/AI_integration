import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  MeetingStatus,
  VisitReportStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OPEN_ASSIGNMENT_STATUSES,
  findVisits,
  visitView,
} from '../visits/visits';

const ASSIGNMENTS_SHOWN = 5;

/** Visits that happened or still can: everything except cancelled / missed. */
const LIVE_MEETING_STATUSES: MeetingStatus[] = [
  MeetingStatus.SCHEDULED,
  MeetingStatus.IN_PROGRESS,
  MeetingStatus.COMPLETED,
];
const LIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  ...OPEN_ASSIGNMENT_STATUSES,
  AssignmentStatus.COMPLETED,
];

/**
 * The agent's own home screen (mobile "Accueil"): KPI tiles, next visit and
 * the latest open assignments.
 */
@Injectable()
export class MeDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(agentId: string, now = new Date()) {
    const scope = { agentId };
    const [
      user,
      allVisits,
      upcoming,
      openAssignments,
      reportsToComplete,
      unread,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: agentId },
        select: { first_name: true, last_name: true },
      }),
      findVisits(this.prisma, {
        scope,
        meetingStatuses: LIVE_MEETING_STATUSES,
        assignmentStatuses: LIVE_ASSIGNMENT_STATUSES,
      }),
      findVisits(this.prisma, { scope, from: now }),
      this.prisma.assignment.findMany({
        where: { agent_id: agentId, status: { in: OPEN_ASSIGNMENT_STATUSES } },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { scheduled_at: 'asc' },
        take: ASSIGNMENTS_SHOWN,
      }),
      this.reportsToComplete(agentId, now),
      this.prisma.notification.count({
        where: { account_id: agentId, read_at: null },
      }),
    ]);

    const next = upcoming[0] ?? null;
    return {
      firstName: user?.first_name ?? null,
      lastName: user?.last_name ?? null,
      kpis: {
        /** Visits from now on (scheduled meetings + open assignments). */
        plannedVisits: upcoming.length,
        /** All visits except cancelled or missed ones. */
        totalVisits: allVisits.length,
        /** Distinct companies among those visits. */
        assignedCompanies: new Set(allVisits.map((visit) => visit.company.id))
          .size,
        /** Visits that ended without a submitted report. */
        reportsToComplete,
      },
      nextVisit: next && visitView(next),
      assignments: openAssignments.map((assignment) => ({
        id: assignment.id,
        company: assignment.company,
        /** "Échéance" in the Figma. */
        scheduledAt: assignment.scheduled_at.toISOString(),
        status: assignment.status,
        priority: assignment.priority,
      })),
      unreadNotifications: unread,
    };
  }

  /** Same rule as the "Compte rendu à compléter" reminder. */
  private async reportsToComplete(agentId: string, now: Date) {
    const meetings = await this.prisma.prospectingMeeting.findMany({
      where: {
        agent_id: agentId,
        status: { in: LIVE_MEETING_STATUSES },
        scheduled_at: { lt: now },
        OR: [{ report: null }, { report: { status: VisitReportStatus.DRAFT } }],
      },
      select: { scheduled_at: true, duration_minutes: true },
    });
    return meetings.filter(
      (meeting) =>
        meeting.scheduled_at.getTime() + meeting.duration_minutes * 60_000 <=
        now.getTime(),
    ).length;
  }
}
