import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MeetingStatus, VisitReportStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { OcrEngine } from '../ocr/ocr.engine';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddVisitReportNoteDto,
  ListVisitReportsQueryDto,
  ReviewVisitReportDto,
  SaveVisitReportDto,
} from './dto/visit-report.dto';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_SCAN_BYTES = 10 * 1024 * 1024;
const SCAN_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
];

const reviewTransitions: Record<string, VisitReportStatus[]> = {
  [VisitReportStatus.SUBMITTED]: [
    VisitReportStatus.IN_REVIEW,
    VisitReportStatus.VALIDATED,
  ],
  [VisitReportStatus.IN_REVIEW]: [VisitReportStatus.VALIDATED],
};

@Injectable()
export class VisitReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly ocr: OcrEngine,
  ) {}

  async listByCompany(companyId: string, actorId: string, role: string) {
    return this.list(actorId, role, { companyId });
  }

  async list(actorId: string, role: string, query: ListVisitReportsQueryDto) {
    const meetingWhere: Record<string, unknown> = {};
    if (role === 'MANAGER') meetingWhere.manager_id = actorId;
    if (role === 'AGENT') meetingWhere.agent_id = actorId;
    if (query.companyId) meetingWhere.company_id = query.companyId;
    if (query.from || query.to) {
      meetingWhere.scheduled_at = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    return this.prisma.visitReport.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.outcomeResult && { outcome_result: query.outcomeResult }),
        ...(query.interestLevel && { interest_level: query.interestLevel }),
        meeting: meetingWhere,
      },
      orderBy: { updated_at: 'desc' },
      select: this.listSelect(),
    });
  }

  async stats(actorId: string, role: string) {
    const meetingWhere =
      role === 'MANAGER'
        ? { manager_id: actorId }
        : role === 'AGENT'
          ? { agent_id: actorId }
          : undefined;
    const where = meetingWhere ? { meeting: meetingWhere } : {};
    const [draft, submitted, inReview, validated] = await Promise.all([
      this.prisma.visitReport.count({
        where: { ...where, status: VisitReportStatus.DRAFT },
      }),
      this.prisma.visitReport.count({
        where: { ...where, status: VisitReportStatus.SUBMITTED },
      }),
      this.prisma.visitReport.count({
        where: { ...where, status: VisitReportStatus.IN_REVIEW },
      }),
      this.prisma.visitReport.count({
        where: { ...where, status: VisitReportStatus.VALIDATED },
      }),
    ]);
    return { draft, submitted, inReview, validated };
  }

  async getByMeeting(meetingId: string, actorId: string, role: string) {
    const meeting = await this.findMeeting(meetingId);
    this.assertReadAccess(meeting, actorId, role);
    const report = await this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
      select: this.listSelect(),
    });
    if (!report) throw new NotFoundException('No report for this visit');
    return report;
  }

  async save(
    meetingId: string,
    actorId: string,
    role: string,
    dto: SaveVisitReportDto,
  ) {
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const existing = await this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
    });
    if (existing && existing.status !== VisitReportStatus.DRAFT) {
      throw new ForbiddenException(
        'Only a draft report can be edited; ask an administrator to reopen it',
      );
    }

    return this.prisma.visitReport.upsert({
      where: { meeting_id: meetingId },
      create: {
        meeting_id: meetingId,
        summary: dto.summary?.trim(),
        needs: dto.needs ?? [],
        solutions: dto.solutions ?? [],
        interest_level: dto.interestLevel,
        outcome_result: dto.outcomeResult,
      },
      update: {
        ...(dto.summary !== undefined && { summary: dto.summary.trim() }),
        ...(dto.needs !== undefined && { needs: dto.needs }),
        ...(dto.solutions !== undefined && { solutions: dto.solutions }),
        ...(dto.interestLevel !== undefined && {
          interest_level: dto.interestLevel,
        }),
        ...(dto.outcomeResult !== undefined && {
          outcome_result: dto.outcomeResult,
        }),
      },
      select: this.listSelect(),
    });
  }

  async submit(meetingId: string, actorId: string, role: string) {
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const report = await this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
    });
    if (!report) throw new NotFoundException('No report for this visit');
    if (report.status !== VisitReportStatus.DRAFT)
      throw new BadRequestException('Only a draft report can be submitted');
    if (!report.summary?.trim())
      throw new BadRequestException(
        'A compte rendu is required before submitting',
      );

    const submitted = await this.prisma.visitReport.update({
      where: { meeting_id: meetingId },
      data: { status: VisitReportStatus.SUBMITTED, submitted_at: new Date() },
      select: this.listSelect(),
    });
    void this.mailService.visitReportSubmitted(meetingId);
    return submitted;
  }

  async review(
    meetingId: string,
    actorId: string,
    role: string,
    dto: ReviewVisitReportDto,
  ) {
    if (role === 'AGENT') {
      throw new ForbiddenException(
        'Only a manager or administrator can review a report',
      );
    }
    const meeting = await this.findMeeting(meetingId);
    this.assertReadAccess(meeting, actorId, role);
    const report = await this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
    });
    if (!report) throw new NotFoundException('No report for this visit');
    const allowed = reviewTransitions[report.status] ?? [];
    if (!allowed.includes(dto.status))
      throw new BadRequestException(
        `A report in ${report.status} cannot move to ${dto.status}`,
      );

    const reviewed = await this.prisma.visitReport.update({
      where: { meeting_id: meetingId },
      data: { status: dto.status },
      select: this.listSelect(),
    });
    void this.mailService.visitReportReviewed(meetingId, dto.status);
    return reviewed;
  }

  async addAttachment(
    meetingId: string,
    actorId: string,
    role: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new ForbiddenException('Attachment exceeds the 5 MB limit');
    }
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const report = await this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
    });
    if (!report) throw new NotFoundException('No report for this visit');
    if (report.status !== VisitReportStatus.DRAFT)
      throw new ForbiddenException(
        'Attachments can only be added to a draft report',
      );

    await this.prisma.visitReportAttachment.create({
      data: {
        report_id: report.id,
        file_name: file.originalname,
        file_mime: file.mimetype,
        file_data: new Uint8Array(file.buffer),
      },
    });
    return this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
      select: this.listSelect(),
    });
  }

  async getAttachment(
    meetingId: string,
    attachmentId: string,
    actorId: string,
    role: string,
  ) {
    const meeting = await this.findMeeting(meetingId);
    this.assertReadAccess(meeting, actorId, role);
    const attachment = await this.prisma.visitReportAttachment.findFirst({
      where: { id: attachmentId, report: { meeting_id: meetingId } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return {
      data: attachment.file_data,
      filename: attachment.file_name,
      mime: attachment.file_mime,
    };
  }

  async removeAttachment(
    meetingId: string,
    attachmentId: string,
    actorId: string,
    role: string,
  ) {
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const attachment = await this.prisma.visitReportAttachment.findFirst({
      where: { id: attachmentId, report: { meeting_id: meetingId } },
      include: { report: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.report.status !== VisitReportStatus.DRAFT)
      throw new ForbiddenException(
        'Attachments can only be removed from a draft report',
      );
    await this.prisma.visitReportAttachment.delete({
      where: { id: attachmentId },
    });
  }

  async addNote(
    meetingId: string,
    actorId: string,
    role: string,
    dto: AddVisitReportNoteDto,
  ) {
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const report = await this.prisma.visitReport.upsert({
      where: { meeting_id: meetingId },
      create: { meeting_id: meetingId },
      update: {},
    });
    await this.prisma.visitReportNote.create({
      data: {
        report_id: report.id,
        author_id: actorId,
        body: dto.body.trim(),
      },
    });
    void this.mailService.visitReportNoteAdded(
      meetingId,
      actorId,
      dto.body.trim(),
    );
    return this.prisma.visitReport.findUnique({
      where: { meeting_id: meetingId },
      select: this.listSelect(),
    });
  }

  async removeNote(
    meetingId: string,
    noteId: string,
    actorId: string,
    role: string,
  ) {
    const meeting = await this.findMeeting(meetingId);
    this.assertWriteAccess(meeting, actorId, role);
    const note = await this.prisma.visitReportNote.findFirst({
      where: { id: noteId, report: { meeting_id: meetingId } },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.author_id !== actorId)
      throw new ForbiddenException('You can only remove your own notes');
    await this.prisma.visitReportNote.delete({ where: { id: noteId } });
  }

  private listSelect() {
    return {
      id: true,
      status: true,
      summary: true,
      needs: true,
      solutions: true,
      interest_level: true,
      outcome_result: true,
      submitted_at: true,
      created_at: true,
      updated_at: true,
      attachments: {
        select: { id: true, file_name: true, file_mime: true },
      },
      notes: {
        orderBy: { created_at: 'asc' as const },
        select: {
          id: true,
          body: true,
          created_at: true,
          author: {
            include: {
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
      },
      meeting: {
        select: {
          id: true,
          title: true,
          scheduled_at: true,
          duration_minutes: true,
          visit_type: true,
          company: {
            select: {
              id: true,
              name: true,
              sector: true,
              address: true,
              contact_name: true,
            },
          },
          agent: {
            include: {
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
      },
    } as const;
  }

  /**
   * "Scanner mes notes": reads a photo of the agent's notes and returns the
   * text to prefill the notes form. Nothing is saved.
   */
  async scanNotes(
    meetingId: string,
    actorId: string,
    role: string,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (role !== 'AGENT') {
      throw new ForbiddenException(
        'Only the agent of the visit can scan notes',
      );
    }
    const meeting = await this.findMeeting(meetingId);
    if (meeting.agent_id !== actorId) {
      throw new ForbiddenException('You do not have access to this visit');
    }
    if (!file) throw new BadRequestException('An image is required');
    if (!SCAN_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP, BMP or TIFF images can be scanned',
      );
    }
    if (file.size > MAX_SCAN_BYTES) {
      throw new BadRequestException('The image exceeds the 10 MB limit');
    }
    try {
      const result = await this.ocr.recognize(file.buffer);
      return { ...result, empty: result.text.length === 0 };
    } catch {
      throw new ServiceUnavailableException('The image could not be read');
    }
  }

  private async findMeeting(meetingId: string) {
    const meeting = await this.prisma.prospectingMeeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  private assertReadAccess(
    meeting: { manager_id: string; agent_id: string },
    actorId: string,
    role: string,
  ) {
    if (role === 'SUPERADMIN') return;
    if (role === 'MANAGER' && meeting.manager_id === actorId) return;
    if (role === 'AGENT' && meeting.agent_id === actorId) return;
    throw new ForbiddenException('You do not have access to this visit');
  }

  private assertWriteAccess(
    meeting: {
      manager_id: string;
      agent_id: string;
      status: MeetingStatus;
    },
    actorId: string,
    role: string,
  ) {
    if (role !== 'AGENT') {
      throw new ForbiddenException(
        'Only the agent who ran the visit can edit its report',
      );
    }
    if (meeting.agent_id !== actorId)
      throw new ForbiddenException('You do not have access to this visit');
    if (meeting.status !== MeetingStatus.COMPLETED)
      throw new BadRequestException(
        'A report can only be filled in for a completed visit',
      );
  }
}
