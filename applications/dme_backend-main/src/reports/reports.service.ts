import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  Prisma,
  ProspectionStatus,
  ReportProcessingStatus,
  ReportVerdict,
} from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { MailService } from '../mail/mail.service';
import { DmePdf } from '../common/pdf/pdf-document';
import { REPORT_VERDICT_LABELS, formatDateTime } from '../mail/mail.labels';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitReportDto, UpdateProspectionDto } from './dto/report.dto';

type AssignmentWithScope = Prisma.AssignmentGetPayload<{
  include: { company: true };
}>;

const reportInclude = {
  prospection: {
    include: {
      company: true,
      assignment: true,
    },
  },
  processing: true,
} satisfies Prisma.FieldReportInclude;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async updateProspection(
    assignmentId: string,
    actorId: string,
    role: AppRole,
    dto: UpdateProspectionDto,
  ) {
    const assignment = await this.requireAssignment(
      assignmentId,
      actorId,
      role,
    );
    const current = await this.prisma.prospection.findUnique({
      where: { assignment_id: assignment.id },
    });
    const currentStatus = current?.status ?? initialStatus(assignment.status);
    assertTransition(currentStatus, dto.status);
    const now = new Date();
    const followUpAt = dto.followUpAt
      ? parseDate(dto.followUpAt, 'followUpAt')
      : undefined;
    const timestamps = timestampsFor(dto.status, now);

    const [prospection] = await this.prisma.$transaction([
      this.prisma.prospection.upsert({
        where: { assignment_id: assignment.id },
        create: {
          assignment_id: assignment.id,
          company_id: assignment.company_id,
          manager_id: assignment.manager_id,
          agent_id: assignment.agent_id,
          status: dto.status,
          notes: dto.notes,
          next_action: dto.nextAction,
          follow_up_at: followUpAt,
          ...timestamps,
        },
        update: {
          status: dto.status,
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.nextAction !== undefined && { next_action: dto.nextAction }),
          ...(followUpAt !== undefined && { follow_up_at: followUpAt }),
          ...timestamps,
        },
        include: { company: true },
      }),
      this.prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          status: assignmentStatusFor(dto.status),
          completed_at: terminalStatus(dto.status) ? now : null,
        },
      }),
    ]);

    return prospection;
  }

  async submitReport(
    assignmentId: string,
    actorId: string,
    role: AppRole,
    dto: SubmitReportDto,
  ) {
    const assignment = await this.requireAssignment(
      assignmentId,
      actorId,
      role,
    );
    const existing = await this.prisma.prospection.findUnique({
      where: { assignment_id: assignment.id },
    });
    const now = new Date();
    const verdict = inferVerdict(dto.outcome, dto.nextAction);
    const prospectionStatus = statusForReport(verdict, dto.nextAction);
    const currentStatus = existing?.status ?? initialStatus(assignment.status);
    assertTransition(currentStatus, prospectionStatus);
    const followUpAt = dto.followUpAt
      ? parseDate(dto.followUpAt, 'followUpAt')
      : null;
    const originalPayload = {
      summary: dto.summary,
      needs: dto.needs,
      outcome: dto.outcome,
      objections: dto.objections ?? null,
      suggestedOffer: dto.suggestedOffer ?? null,
      nextAction: dto.nextAction ?? null,
      followUpAt: dto.followUpAt ?? null,
    };

    const result = await this.prisma.$transaction(async (transaction) => {
      const prospection = existing
        ? await transaction.prospection.update({
            where: { id: existing.id },
            data: {
              status: prospectionStatus,
              visited_at: existing.visited_at ?? now,
              ...(dto.nextAction !== undefined && {
                next_action: dto.nextAction,
              }),
              follow_up_at: followUpAt,
              completed_at: terminalStatus(prospectionStatus) ? now : null,
            },
          })
        : await transaction.prospection.create({
            data: {
              assignment_id: assignment.id,
              company_id: assignment.company_id,
              manager_id: assignment.manager_id,
              agent_id: assignment.agent_id,
              status: prospectionStatus,
              visited_at: now,
              next_action: dto.nextAction,
              follow_up_at: followUpAt,
              completed_at: terminalStatus(prospectionStatus) ? now : null,
            },
          });
      const report = await transaction.fieldReport.upsert({
        where: { prospection_id: prospection.id },
        create: {
          prospection_id: prospection.id,
          created_by_id: actorId,
          original_payload: originalPayload,
          summary: dto.summary,
          needs: dto.needs,
          outcome: dto.outcome,
          objections: dto.objections,
          suggested_offer: dto.suggestedOffer,
          next_action: dto.nextAction,
          follow_up_at: followUpAt,
        },
        update: {
          summary: dto.summary,
          needs: dto.needs,
          outcome: dto.outcome,
          objections: dto.objections,
          suggested_offer: dto.suggestedOffer,
          next_action: dto.nextAction,
          follow_up_at: followUpAt,
        },
      });
      await transaction.reportProcessingResult.upsert({
        where: { field_report_id: report.id },
        create: processingData(report.id, dto, verdict, now),
        update: processingData(report.id, dto, verdict, now),
      });
      await transaction.assignment.update({
        where: { id: assignment.id },
        data: {
          status: assignmentStatusFor(prospectionStatus),
          completed_at: terminalStatus(prospectionStatus) ? now : null,
        },
      });
      return report.id;
    });
    void this.mailService.fieldReportAnalyzed(result);

    return this.getReportById(result, actorId, role);
  }

  async getReportByAssignment(
    assignmentId: string,
    actorId: string,
    role: AppRole,
  ) {
    const assignment = await this.requireAssignment(
      assignmentId,
      actorId,
      role,
    );
    const prospection = await this.prisma.prospection.findUnique({
      where: { assignment_id: assignment.id },
      select: { id: true },
    });
    if (!prospection) throw new NotFoundException('Report not found');
    const report = await this.prisma.fieldReport.findUnique({
      where: { prospection_id: prospection.id },
      include: reportInclude,
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async exportReport(assignmentId: string, actorId: string, role: AppRole) {
    const report = await this.getReportByAssignment(
      assignmentId,
      actorId,
      role,
    );
    const company = report.prospection.company.name;
    const verdict = report.processing?.verdict;
    const pdf = new DmePdf('Rapport de prospection', company)
      .keyValues([
        ['Entreprise', company],
        ['Statut', PROSPECTION_STATUS_LABELS[report.prospection.status]],
        ['Verdict', verdict ? REPORT_VERDICT_LABELS[verdict] : 'En attente'],
        ['Prochaine action', report.next_action],
        [
          'Relance prévue',
          report.follow_up_at ? formatDateTime(report.follow_up_at) : null,
        ],
      ])
      .section('Compte rendu')
      .paragraph(report.summary)
      .section('Besoins identifiés')
      .paragraph(report.needs)
      .section('Résultat')
      .paragraph(report.outcome);
    if (report.objections) {
      pdf.section('Objections').paragraph(report.objections);
    }
    if (report.suggested_offer) {
      pdf.section('Offre suggérée').paragraph(report.suggested_offer);
    }
    if (report.processing?.reasons) {
      pdf.section('Analyse').paragraph(report.processing.reasons);
    }
    return {
      buffer: await pdf.toBuffer(),
      filename: `prospection-${
        report.prospection.company.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'rapport'
      }.pdf`,
    };
  }

  private async getReportById(id: string, actorId: string, role: AppRole) {
    const report = await this.prisma.fieldReport.findUnique({
      where: { id },
      include: reportInclude,
    });
    if (!report) throw new NotFoundException('Report not found');
    await this.requireAssignment(
      report.prospection.assignment_id,
      actorId,
      role,
    );
    return report;
  }

  private async requireAssignment(
    id: string,
    actorId: string,
    role: AppRole,
  ): Promise<AssignmentWithScope> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (
      (role === 'MANAGER' && assignment.manager_id !== actorId) ||
      (role === 'AGENT' && assignment.agent_id !== actorId)
    ) {
      throw new ForbiddenException('This assignment is outside your scope');
    }
    return assignment;
  }
}

function initialStatus(status: AssignmentStatus): ProspectionStatus {
  if (status === AssignmentStatus.IN_PROGRESS)
    return ProspectionStatus.IN_PROGRESS;
  if (status === AssignmentStatus.COMPLETED) return ProspectionStatus.VISITED;
  if (status === AssignmentStatus.CANCELLED) return ProspectionStatus.CLOSED;
  return ProspectionStatus.PLANNED;
}

function assertTransition(from: ProspectionStatus, to: ProspectionStatus) {
  const allowed: Record<ProspectionStatus, ProspectionStatus[]> = {
    PLANNED: [
      ProspectionStatus.PLANNED,
      ProspectionStatus.IN_PROGRESS,
      ProspectionStatus.VISITED,
      ProspectionStatus.FOLLOW_UP,
      ProspectionStatus.CONVERTED,
      ProspectionStatus.CLOSED,
    ],
    IN_PROGRESS: [
      ProspectionStatus.IN_PROGRESS,
      ProspectionStatus.VISITED,
      ProspectionStatus.FOLLOW_UP,
      ProspectionStatus.CLOSED,
    ],
    VISITED: [
      ProspectionStatus.VISITED,
      ProspectionStatus.FOLLOW_UP,
      ProspectionStatus.CONVERTED,
      ProspectionStatus.CLOSED,
    ],
    FOLLOW_UP: [
      ProspectionStatus.FOLLOW_UP,
      ProspectionStatus.CONVERTED,
      ProspectionStatus.CLOSED,
    ],
    CONVERTED: [ProspectionStatus.CONVERTED],
    CLOSED: [ProspectionStatus.CLOSED],
  };
  if (!allowed[from].includes(to)) {
    throw new BadRequestException(
      `Invalid prospection transition: ${from} to ${to}`,
    );
  }
}

function parseDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

function timestampsFor(status: ProspectionStatus, now: Date) {
  return {
    ...(status === ProspectionStatus.IN_PROGRESS && { started_at: now }),
    ...(status === ProspectionStatus.VISITED && { visited_at: now }),
    ...(status === ProspectionStatus.CONVERTED ||
    status === ProspectionStatus.CLOSED
      ? { completed_at: now }
      : {}),
  };
}

function terminalStatus(status: ProspectionStatus) {
  return (
    status === ProspectionStatus.CONVERTED ||
    status === ProspectionStatus.CLOSED
  );
}

function assignmentStatusFor(status: ProspectionStatus): AssignmentStatus {
  if (status === ProspectionStatus.PLANNED) return AssignmentStatus.ASSIGNED;
  if (status === ProspectionStatus.IN_PROGRESS)
    return AssignmentStatus.IN_PROGRESS;
  if (terminalStatus(status)) return AssignmentStatus.COMPLETED;
  return AssignmentStatus.COMPLETED;
}

function inferVerdict(outcome: string, nextAction?: string): ReportVerdict {
  const text = `${outcome} ${nextAction ?? ''}`.toLowerCase();
  if (/convert|sign|contract|commande|client/.test(text))
    return ReportVerdict.CONVERTED;
  if (/not eligible|ineligible|non eligible|refus|aucun besoin/.test(text))
    return ReportVerdict.NOT_ELIGIBLE;
  if (nextAction?.trim()) return ReportVerdict.QUALIFIED_FOLLOW_UP;
  return ReportVerdict.PENDING_INFORMATION;
}

function statusForReport(verdict: ReportVerdict, nextAction?: string) {
  if (verdict === ReportVerdict.CONVERTED) return ProspectionStatus.CONVERTED;
  if (verdict === ReportVerdict.NOT_ELIGIBLE) return ProspectionStatus.CLOSED;
  if (nextAction?.trim()) return ProspectionStatus.FOLLOW_UP;
  return ProspectionStatus.VISITED;
}

function processingData(
  reportId: string,
  dto: SubmitReportDto,
  verdict: ReportVerdict,
  now: Date,
) {
  return {
    field_report_id: reportId,
    status: ReportProcessingStatus.COMPLETED,
    customer_context: dto.summary,
    structured_needs: dto.needs,
    objections: dto.objections,
    suggested_offer: dto.suggestedOffer,
    visit_outcome: dto.outcome,
    next_action: dto.nextAction,
    follow_up_at: dto.followUpAt
      ? parseDate(dto.followUpAt, 'followUpAt')
      : null,
    verdict,
    reasons: reasonForVerdict(verdict),
    failure_message: null,
    processed_at: now,
  };
}

function reasonForVerdict(verdict: ReportVerdict) {
  const reasons: Record<ReportVerdict, string> = {
    QUALIFIED_FOLLOW_UP:
      'A next action was recorded for continued qualification.',
    PENDING_INFORMATION:
      'The report does not contain enough information for a final qualification.',
    NOT_ELIGIBLE:
      'The reported outcome indicates that the company is not eligible.',
    CONVERTED:
      'The reported outcome indicates a conversion or signed commitment.',
  };
  return reasons[verdict];
}

const PROSPECTION_STATUS_LABELS: Record<ProspectionStatus, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  VISITED: 'Visitée',
  FOLLOW_UP: 'Relance',
  CONVERTED: 'Convertie',
  CLOSED: 'Clôturée',
};
