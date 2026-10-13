import { Injectable } from '@nestjs/common';
import { AssignmentStatus, VisitReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OPEN_ASSIGNMENT_STATUSES,
  findVisits,
  tunisDay,
  tunisWeek,
  visitScopeFor,
  visitView,
} from '../visits/visits';

/**
 * Stats for the "Assignation" and "Planifier une visite" pages, scoped by
 * role: an agent sees their own, a manager their team's, a superadmin all.
 */
@Injectable()
export class AssignmentsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actorId: string, role: string, now = new Date()) {
    const scope = visitScopeFor(actorId, role);
    const assignmentWhere = {
      ...(scope.agentId && { agent_id: scope.agentId }),
      ...(scope.managerId && { manager_id: scope.managerId }),
    };
    const meetingScope = {
      ...(scope.agentId && { agent_id: scope.agentId }),
      ...(scope.managerId && { manager_id: scope.managerId }),
    };
    const today = tunisDay(now);
    const week = tunisWeek(now);

    const [
      byStatus,
      upcoming,
      todayVisits,
      weekVisits,
      awaitingReview,
      overdue,
    ] = await Promise.all([
      this.prisma.assignment.groupBy({
        by: ['status'],
        where: assignmentWhere,
        _count: { _all: true },
      }),
      findVisits(this.prisma, { scope, from: now }),
      findVisits(this.prisma, { scope, from: today.start, to: today.end }),
      findVisits(this.prisma, { scope, from: week.start, to: week.end }),
      this.prisma.visitReport.count({
        where: {
          status: {
            in: [VisitReportStatus.SUBMITTED, VisitReportStatus.IN_REVIEW],
          },
          meeting: meetingScope,
        },
      }),
      this.prisma.assignment.count({
        where: {
          ...assignmentWhere,
          status: { in: OPEN_ASSIGNMENT_STATUSES },
          scheduled_at: { lt: now },
        },
      }),
    ]);

    const counts = Object.fromEntries(
      Object.values(AssignmentStatus).map((status) => [
        status,
        byStatus.find((row) => row.status === status)?._count._all ?? 0,
      ]),
    ) as Record<AssignmentStatus, number>;

    return {
      /** "Assignations totales" */
      totalAssignments: Object.values(counts).reduce((a, b) => a + b, 0),
      assignmentsByStatus: counts,
      /** "Rapports en attente": visit reports submitted, not yet validated. */
      reportsAwaitingReview: awaitingReview,
      /** Assignments whose date passed while still open (no report yet). */
      overdueAssignments: overdue,
      /** "Visites aujourd'hui" / "cette semaine" (planned, still to do). */
      visitsToday: todayVisits.length,
      visitsThisWeek: weekVisits.length,
      /** "Première visite planifiée": the first visit of today. */
      firstVisitToday: todayVisits[0] ? visitView(todayVisits[0]) : null,
      /** "Prochaine visite planifiée": the next visit from now. */
      nextVisit: upcoming[0] ? visitView(upcoming[0]) : null,
    };
  }
}
