import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  CompanyStatus,
  MeetingStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMeetingDto,
  ListMeetingsQueryDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';

const activeMeetingStatuses: MeetingStatus[] = [
  MeetingStatus.SCHEDULED,
  MeetingStatus.IN_PROGRESS,
];
const terminalMeetingStatuses: MeetingStatus[] = [
  MeetingStatus.COMPLETED,
  MeetingStatus.CANCELLED,
  MeetingStatus.NO_SHOW,
];

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async list(accountId: string, role: string, query: ListMeetingsQueryDto) {
    const where: Prisma.ProspectingMeetingWhereInput = {};
    if (role === 'MANAGER') where.manager_id = accountId;
    if (role === 'AGENT') where.agent_id = accountId;
    if (role === 'SUPERADMIN' && query.managerId)
      where.manager_id = query.managerId;
    if (role !== 'AGENT' && query.agentId) where.agent_id = query.agentId;
    if (query.companyId) where.company_id = query.companyId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.scheduled_at = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    return this.prisma.prospectingMeeting.findMany({
      where,
      include: this.includeRelations(),
      orderBy: { scheduled_at: 'asc' },
    });
  }

  async get(id: string, accountId: string, role: string) {
    const meeting = await this.findMeeting(id);
    this.assertReadAccess(meeting, accountId, role);
    return meeting;
  }

  async create(actorId: string, role: string, dto: CreateMeetingDto) {
    const agentId = role === 'AGENT' ? actorId : dto.agentId;
    const managerId =
      role === 'AGENT'
        ? await this.resolveAgentManagerId(actorId)
        : role === 'SUPERADMIN'
          ? dto.managerId
          : actorId;
    if (!managerId) throw new BadRequestException('A manager is required');
    const scheduledAt = this.parseFutureDate(dto.scheduledAt);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('A meeting title is required');
    await this.assertManager(managerId);
    await this.assertManagedCompany(dto.companyId, managerId);
    if (role !== 'AGENT') await this.assertAgent(agentId, managerId);
    await this.assertAgentAvailability(
      agentId,
      scheduledAt,
      dto.durationMinutes,
    );
    const meeting = await this.prisma.prospectingMeeting.create({
      data: {
        company_id: dto.companyId,
        manager_id: managerId,
        agent_id: agentId,
        title,
        agenda: this.normalizeOptionalText(dto.agenda),
        location: this.normalizeOptionalText(dto.location),
        meeting_url: dto.meetingUrl,
        scheduled_at: scheduledAt,
        duration_minutes: dto.durationMinutes,
        ...(dto.visitType && { visit_type: dto.visitType }),
        reminder_enabled: dto.reminderEnabled ?? true,
      },
      include: this.includeRelations(),
    });
    void this.mailService.meetingScheduled(meeting.id, actorId);
    return meeting;
  }

  private async resolveAgentManagerId(
    agentId: string,
  ): Promise<string | undefined> {
    const agent = await this.prisma.account.findFirst({
      where: {
        id: agentId,
        account_type: AccountType.USER,
        user: { role: UserRole.AGENT, status: 'ACTIVE' },
      },
      select: { user: { select: { manager_id: true } } },
    });
    return agent?.user?.manager_id ?? undefined;
  }

  async update(
    id: string,
    actorId: string,
    role: string,
    dto: UpdateMeetingDto,
  ) {
    const current = await this.findMeeting(id);
    this.assertWriteAccess(current, actorId, role, dto);
    const managerId = dto.managerId ?? current.manager_id;
    const agentId = dto.agentId ?? current.agent_id;
    const scheduledAt = dto.scheduledAt
      ? this.parseFutureDate(dto.scheduledAt)
      : current.scheduled_at;
    const durationMinutes = dto.durationMinutes ?? current.duration_minutes;
    const status = dto.status ?? current.status;
    const title = dto.title === undefined ? undefined : dto.title.trim();
    if (dto.title !== undefined && !title) {
      throw new BadRequestException('A meeting title is required');
    }

    this.assertStatusUpdate(current.status, status, role, dto);
    if (
      current.status !== MeetingStatus.SCHEDULED &&
      (dto.scheduledAt || dto.durationMinutes !== undefined || dto.agentId)
    )
      throw new BadRequestException(
        'Only scheduled meetings can be rescheduled or reassigned',
      );
    if (dto.managerId) {
      await this.assertManager(managerId);
      await this.assertManagedCompany(current.company_id, managerId);
    }
    if (dto.managerId || dto.agentId)
      await this.assertAgent(agentId, managerId);
    if (dto.scheduledAt || dto.durationMinutes || dto.agentId)
      await this.assertAgentAvailability(
        agentId,
        scheduledAt,
        durationMinutes,
        current.id,
      );

    const updated = await this.prisma.prospectingMeeting.update({
      where: { id },
      data: {
        ...(dto.managerId && { manager_id: managerId }),
        ...(dto.agentId && { agent_id: agentId }),
        ...(title !== undefined && { title }),
        ...(dto.agenda !== undefined && {
          agenda: this.normalizeOptionalText(dto.agenda),
        }),
        ...(dto.location !== undefined && {
          location: this.normalizeOptionalText(dto.location),
        }),
        ...(dto.meetingUrl !== undefined && { meeting_url: dto.meetingUrl }),
        ...(dto.scheduledAt && { scheduled_at: scheduledAt }),
        ...(dto.durationMinutes !== undefined && {
          duration_minutes: dto.durationMinutes,
        }),
        ...(dto.visitType && { visit_type: dto.visitType }),
        ...(dto.reminderEnabled !== undefined && {
          reminder_enabled: dto.reminderEnabled,
        }),
        ...(dto.status && {
          status,
          completed_at:
            status === MeetingStatus.COMPLETED ? new Date() : undefined,
          cancellation_reason:
            status === MeetingStatus.CANCELLED
              ? dto.cancellationReason?.trim()
              : undefined,
        }),
        ...(dto.outcome !== undefined && {
          outcome: this.normalizeOptionalText(dto.outcome),
        }),
        ...(dto.completionNotes !== undefined && {
          completion_notes: this.normalizeOptionalText(dto.completionNotes),
        }),
      },
      include: this.includeRelations(),
    });
    void this.mailService.meetingChanged(current, actorId);
    return updated;
  }

  private includeRelations() {
    return {
      company: true,
      manager: {
        include: { user: { select: { first_name: true, last_name: true } } },
      },
      agent: {
        include: { user: { select: { first_name: true, last_name: true } } },
      },
    } satisfies Prisma.ProspectingMeetingInclude;
  }

  private async findMeeting(id: string) {
    const meeting = await this.prisma.prospectingMeeting.findUnique({
      where: { id },
      include: this.includeRelations(),
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  private assertReadAccess(
    meeting: { manager_id: string; agent_id: string },
    accountId: string,
    role: string,
  ) {
    if (role === 'SUPERADMIN') return;
    if (role === 'MANAGER' && meeting.manager_id === accountId) return;
    if (role === 'AGENT' && meeting.agent_id === accountId) return;
    throw new ForbiddenException('You do not have access to this meeting');
  }

  private assertWriteAccess(
    meeting: { manager_id: string; agent_id: string; status: MeetingStatus },
    accountId: string,
    role: string,
    dto: UpdateMeetingDto,
  ) {
    this.assertReadAccess(meeting, accountId, role);
    if (role === 'MANAGER' && dto.managerId !== undefined) {
      throw new ForbiddenException(
        'Managers cannot transfer meetings to another manager',
      );
    }
    if (role !== 'AGENT') return;
    if (
      dto.managerId !== undefined ||
      dto.agentId !== undefined ||
      dto.cancellationReason !== undefined
    )
      throw new ForbiddenException(
        'Agents cannot reassign or cancel a meeting',
      );
    const editsDetails =
      dto.title !== undefined ||
      dto.agenda !== undefined ||
      dto.location !== undefined ||
      dto.meetingUrl !== undefined ||
      dto.scheduledAt !== undefined ||
      dto.durationMinutes !== undefined ||
      dto.visitType !== undefined;
    if (editsDetails && terminalMeetingStatuses.includes(meeting.status))
      throw new ForbiddenException(
        'A completed, cancelled, or missed meeting cannot be edited',
      );
  }

  private assertStatusUpdate(
    current: MeetingStatus,
    next: MeetingStatus,
    role: string,
    dto: UpdateMeetingDto,
  ) {
    const editingNotesOnly =
      dto.outcome !== undefined || dto.completionNotes !== undefined;

    if (!dto.status || current === next) {
      if (
        role === 'AGENT' &&
        editingNotesOnly &&
        current !== MeetingStatus.COMPLETED
      )
        throw new BadRequestException(
          'Agents can add an outcome only while completing a meeting',
        );
      return;
    }
    if (terminalMeetingStatuses.includes(current))
      throw new BadRequestException(
        'A completed, cancelled, or missed meeting cannot be changed',
      );
    if (role === 'AGENT') {
      const allowed =
        (current === MeetingStatus.SCHEDULED &&
          next === MeetingStatus.IN_PROGRESS) ||
        (current === MeetingStatus.IN_PROGRESS &&
          next === MeetingStatus.COMPLETED);
      if (!allowed)
        throw new ForbiddenException(
          'Agents can only start or complete their own meetings',
        );
      if (next === MeetingStatus.COMPLETED && !dto.outcome?.trim())
        throw new BadRequestException(
          'A completed meeting requires an outcome',
        );
      return;
    }
    if (!(
      (current === MeetingStatus.SCHEDULED &&
        (
          [
            MeetingStatus.IN_PROGRESS,
            MeetingStatus.CANCELLED,
            MeetingStatus.NO_SHOW,
          ] as MeetingStatus[]
        ).includes(next)) ||
      (current === MeetingStatus.IN_PROGRESS &&
        (
          [
            MeetingStatus.COMPLETED,
            MeetingStatus.CANCELLED,
            MeetingStatus.NO_SHOW,
          ] as MeetingStatus[]
        ).includes(next))
    ))
      throw new BadRequestException('Invalid meeting status transition');
    if (next === MeetingStatus.CANCELLED && !dto.cancellationReason?.trim())
      throw new BadRequestException('A cancellation reason is required');
  }

  private async assertManager(id: string) {
    const manager = await this.prisma.account.findFirst({
      where: {
        id,
        account_type: AccountType.USER,
        user: { role: UserRole.MANAGER, status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!manager) throw new ForbiddenException('Invalid manager');
  }

  private async assertManagedCompany(companyId: string, managerId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
        manager_id: managerId,
      },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
  }

  private async assertAgent(id: string, managerId: string) {
    const agent = await this.prisma.account.findFirst({
      where: {
        id,
        account_type: AccountType.USER,
        user: {
          role: UserRole.AGENT,
          status: 'ACTIVE',
          manager_id: managerId,
        },
      },
      select: { id: true },
    });
    if (!agent)
      throw new ForbiddenException('Agent is not assigned to this manager');
  }

  private async assertAgentAvailability(
    agentId: string,
    scheduledAt: Date,
    durationMinutes: number,
    excludeId?: string,
  ) {
    const candidateEnd = new Date(
      scheduledAt.getTime() + durationMinutes * 60_000,
    );
    const meetings = await this.prisma.prospectingMeeting.findMany({
      where: {
        agent_id: agentId,
        status: { in: activeMeetingStatuses },
        ...(excludeId && { id: { not: excludeId } }),
        scheduled_at: { lt: candidateEnd },
      },
      select: { scheduled_at: true, duration_minutes: true },
    });
    const overlaps = meetings.some((meeting) => {
      const end = new Date(
        meeting.scheduled_at.getTime() + meeting.duration_minutes * 60_000,
      );
      return scheduledAt < end;
    });
    if (overlaps)
      throw new BadRequestException(
        'The agent already has a meeting at this time',
      );
  }

  private parseFutureDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date())
      throw new BadRequestException(
        'The meeting must be scheduled in the future',
      );
    return date;
  }

  private normalizeOptionalText(value: string | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
