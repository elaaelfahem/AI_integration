import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  MeetingStatus,
  ReportVerdict,
  VisitReportInterestLevel,
  VisitReportOutcome,
  VisitReportStatus,
} from '@prisma/client';
import { DmePdf } from '../common/pdf/pdf-document';
import { REPORT_VERDICT_LABELS, formatDateTime } from '../mail/mail.labels';
import { PrismaService } from '../prisma/prisma.service';
import {
  OPEN_ASSIGNMENT_STATUSES,
  TUNIS_TIME_ZONE,
  findVisits,
  tunisMonth,
  visitScopeFor,
} from '../visits/visits';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const VISIT_REPORT_STATUS_LABELS: Record<VisitReportStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  IN_REVIEW: 'En revue',
  VALIDATED: 'Validé',
};
const INTEREST_LABELS: Record<VisitReportInterestLevel, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyen',
  HIGH: 'Élevé',
};
const OUTCOME_LABELS: Record<VisitReportOutcome, string> = {
  INTERESTED: 'Intéressé',
  TO_FOLLOW_UP: 'À relancer',
  NEGOTIATION: 'Négociation',
  OPPORTUNITY_WON: 'Opportunité gagnée',
  OPPORTUNITY_LOST: 'Opportunité perdue',
  NOT_INTERESTED: 'Pas intéressé',
};

const countBy = <T extends string>(keys: readonly T[], values: (T | null)[]) =>
  Object.fromEntries(
    keys.map((key) => [key, values.filter((value) => value === key).length]),
  ) as Record<T, number>;

/**
 * Monthly rollup of visits and reports, scoped by role: an agent gets their
 * own month, a manager their team's, a superadmin the whole organisation.
 */
@Injectable()
export class MonthlyReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** "YYYY-MM" of the current month in Tunis. */
  currentMonth(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TUNIS_TIME_ZONE })
      .format(now)
      .slice(0, 7);
  }

  async summary(actorId: string, role: string, month?: string) {
    const period = month ?? this.currentMonth();
    if (!MONTH_PATTERN.test(period)) {
      throw new BadRequestException('month must look like 2026-10');
    }
    const { start, end } = tunisMonth(period);
    const scope = visitScopeFor(actorId, role);
    const meetingScope = {
      ...(scope.agentId && { agent_id: scope.agentId }),
      ...(scope.managerId && { manager_id: scope.managerId }),
    };

    const [visits, visitReports, fieldReports, scopeLabel] = await Promise.all([
      findVisits(this.prisma, {
        scope,
        from: start,
        to: end,
        meetingStatuses: Object.values(MeetingStatus),
        assignmentStatuses: Object.values(AssignmentStatus),
      }),
      this.prisma.visitReport.findMany({
        where: {
          meeting: { ...meetingScope, scheduled_at: { gte: start, lt: end } },
        },
        select: {
          status: true,
          interest_level: true,
          outcome_result: true,
          submitted_at: true,
          meeting: {
            select: {
              id: true,
              title: true,
              scheduled_at: true,
              agent_id: true,
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { meeting: { scheduled_at: 'asc' } },
      }),
      this.prisma.fieldReport.findMany({
        where: {
          created_at: { gte: start, lt: end },
          prospection: meetingScope,
        },
        select: {
          created_at: true,
          created_by_id: true,
          next_action: true,
          processing: { select: { verdict: true } },
          prospection: { select: { company: { select: { name: true } } } },
        },
        orderBy: { created_at: 'asc' },
      }),
      this.scopeLabel(actorId, role),
    ]);

    const agentIds = [
      ...new Set([
        ...visits.map((visit) => visit.agentId),
        ...fieldReports.map((report) => report.created_by_id),
      ]),
    ];
    const agents = await this.prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, first_name: true, last_name: true },
    });
    const nameOf = (id: string) => {
      const agent = agents.find((candidate) => candidate.id === id);
      return agent ? `${agent.first_name} ${agent.last_name}` : '—';
    };

    const isDone = (status: string) =>
      status === MeetingStatus.COMPLETED ||
      status === AssignmentStatus.COMPLETED;
    const isCancelled = (status: string) =>
      status === MeetingStatus.CANCELLED ||
      status === AssignmentStatus.CANCELLED;
    const isOpen = (status: string) =>
      status === MeetingStatus.SCHEDULED ||
      status === MeetingStatus.IN_PROGRESS ||
      OPEN_ASSIGNMENT_STATUSES.includes(status as AssignmentStatus);

    const submitted = (status: VisitReportStatus) =>
      status !== VisitReportStatus.DRAFT;

    return {
      month: period,
      label: new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: TUNIS_TIME_ZONE,
      }).format(start),
      scope: scopeLabel,
      period: { start: start.toISOString(), end: end.toISOString() },
      visits: {
        total: visits.length,
        completed: visits.filter((visit) => isDone(visit.status)).length,
        cancelled: visits.filter((visit) => isCancelled(visit.status)).length,
        missed: visits.filter((visit) => visit.status === MeetingStatus.NO_SHOW)
          .length,
        open: visits.filter((visit) => isOpen(visit.status)).length,
      },
      visitReports: {
        total: visitReports.length,
        byStatus: countBy(
          Object.values(VisitReportStatus),
          visitReports.map((report) => report.status),
        ),
        byInterest: countBy(
          Object.values(VisitReportInterestLevel),
          visitReports.map((report) => report.interest_level),
        ),
        byOutcome: countBy(
          Object.values(VisitReportOutcome),
          visitReports.map((report) => report.outcome_result),
        ),
      },
      fieldReports: {
        total: fieldReports.length,
        byVerdict: countBy(
          Object.values(ReportVerdict),
          fieldReports.map((report) => report.processing?.verdict ?? null),
        ),
      },
      agents: agentIds
        .map((id) => {
          const own = visits.filter((visit) => visit.agentId === id);
          const reports = visitReports.filter(
            (report) => report.meeting.agent_id === id,
          );
          return {
            agentId: id,
            name: nameOf(id),
            visits: own.length,
            completed: own.filter((visit) => isDone(visit.status)).length,
            reportsSubmitted: reports.filter((report) =>
              submitted(report.status),
            ).length,
            reportsValidated: reports.filter(
              (report) => report.status === VisitReportStatus.VALIDATED,
            ).length,
            fieldReports: fieldReports.filter(
              (report) => report.created_by_id === id,
            ).length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      visitReportRows: visitReports.map((report) => ({
        meetingId: report.meeting.id,
        date: report.meeting.scheduled_at.toISOString(),
        company: report.meeting.company.name,
        agent: nameOf(report.meeting.agent_id),
        status: report.status,
        interestLevel: report.interest_level,
        outcome: report.outcome_result,
      })),
      fieldReportRows: fieldReports.map((report) => ({
        date: report.created_at.toISOString(),
        company: report.prospection.company.name,
        agent: nameOf(report.created_by_id),
        verdict: report.processing?.verdict ?? null,
        nextAction: report.next_action,
      })),
    };
  }

  async exportPdf(actorId: string, role: string, month?: string) {
    const data = await this.summary(actorId, role, month);
    const label = data.label.charAt(0).toUpperCase() + data.label.slice(1);
    const pdf = new DmePdf(
      `Rapport mensuel · ${label}`,
      `${data.scope} · généré le ${formatDateTime(new Date())}`,
    );

    pdf.section('Synthèse').keyValues([
      ['Visites prévues sur le mois', data.visits.total],
      ['Visites réalisées', data.visits.completed],
      ['Visites encore à faire', data.visits.open],
      ['Visites annulées', data.visits.cancelled],
      ['Visites manquées', data.visits.missed],
      ['Comptes rendus de visite', data.visitReports.total],
      ['dont validés', data.visitReports.byStatus.VALIDATED],
      [
        'dont en attente de validation',
        data.visitReports.byStatus.SUBMITTED +
          data.visitReports.byStatus.IN_REVIEW,
      ],
      ['dont brouillons', data.visitReports.byStatus.DRAFT],
      ['Rapports de prospection', data.fieldReports.total],
      ...Object.entries(data.fieldReports.byVerdict)
        .filter(([, count]) => count > 0)
        .map(
          ([verdict, count]) =>
            [`  ${REPORT_VERDICT_LABELS[verdict as ReportVerdict]}`, count] as [
              string,
              number,
            ],
        ),
    ]);

    const outcomes = Object.entries(data.visitReports.byOutcome).filter(
      ([, count]) => count > 0,
    );
    if (outcomes.length) {
      pdf
        .section('Résultats des visites')
        .keyValues(
          outcomes.map(([outcome, count]) => [
            OUTCOME_LABELS[outcome as VisitReportOutcome],
            count,
          ]),
        );
    }

    if (role !== 'AGENT') {
      pdf.section('Activité par agent').table(
        [
          { header: 'Agent', width: 0.3, value: (row) => row.name },
          { header: 'Visites', width: 0.13, value: (row) => row.visits },
          { header: 'Réalisées', width: 0.14, value: (row) => row.completed },
          {
            header: 'CR soumis',
            width: 0.14,
            value: (row) => row.reportsSubmitted,
          },
          {
            header: 'CR validés',
            width: 0.14,
            value: (row) => row.reportsValidated,
          },
          {
            header: 'Prospection',
            width: 0.15,
            value: (row) => row.fieldReports,
          },
        ],
        data.agents,
      );
    }

    pdf.section('Comptes rendus de visite').table(
      [
        {
          header: 'Date',
          width: 0.2,
          value: (row) => shortDateTime(row.date),
        },
        { header: 'Entreprise', width: 0.24, value: (row) => row.company },
        { header: 'Agent', width: 0.18, value: (row) => row.agent },
        {
          header: 'Statut',
          width: 0.12,
          value: (row) => VISIT_REPORT_STATUS_LABELS[row.status],
        },
        {
          header: 'Intérêt',
          width: 0.1,
          value: (row) =>
            row.interestLevel ? INTEREST_LABELS[row.interestLevel] : null,
        },
        {
          header: 'Résultat',
          width: 0.16,
          value: (row) => (row.outcome ? OUTCOME_LABELS[row.outcome] : null),
        },
      ],
      data.visitReportRows,
      'Aucun compte rendu de visite ce mois-ci.',
    );

    pdf.section('Rapports de prospection').table(
      [
        {
          header: 'Date',
          width: 0.2,
          value: (row) => shortDateTime(row.date),
        },
        { header: 'Entreprise', width: 0.24, value: (row) => row.company },
        { header: 'Agent', width: 0.18, value: (row) => row.agent },
        {
          header: 'Verdict',
          width: 0.18,
          value: (row) =>
            row.verdict ? REPORT_VERDICT_LABELS[row.verdict] : 'En attente',
        },
        {
          header: 'Prochaine action',
          width: 0.2,
          value: (row) => row.nextAction,
        },
      ],
      data.fieldReportRows,
      'Aucun rapport de prospection ce mois-ci.',
    );

    return {
      buffer: await pdf.toBuffer(),
      filename: `rapport-mensuel-${data.month}.pdf`,
    };
  }

  private async scopeLabel(actorId: string, role: string) {
    if (role === 'SUPERADMIN') return 'Toute l’organisation';
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { first_name: true, last_name: true },
    });
    const name = user ? `${user.first_name} ${user.last_name}` : '';
    return role === 'MANAGER' ? `Équipe de ${name}` : name;
  }
}

/** "09/09/2026 10:00" in Tunis time, compact enough for table cells. */
function shortDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TUNIS_TIME_ZONE,
  }).format(new Date(iso));
}
