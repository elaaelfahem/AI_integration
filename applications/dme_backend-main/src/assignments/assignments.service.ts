import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  AssignmentStatus,
  CompanyStatus,
  UserRole,
} from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async list(accountId: string, role: string) {
    const where =
      role === 'SUPERADMIN'
        ? {}
        : role === 'MANAGER'
          ? { manager_id: accountId }
          : { agent_id: accountId };
    return this.prisma.assignment.findMany({
      where,
      include: {
        company: true,
        prospection: {
          select: {
            status: true,
            report: { select: { id: true } },
          },
        },
        manager: {
          include: {
            user: { select: { first_name: true, last_name: true } },
            superadmin: { select: { first_name: true, last_name: true } },
          },
        },
        agent: {
          include: {
            user: {
              select: { first_name: true, last_name: true, manager_id: true },
            },
          },
        },
      },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  async create(actorId: string, role: string, dto: CreateAssignmentDto) {
    const managerId = role === 'SUPERADMIN' ? dto.managerId : actorId;
    if (!managerId) throw new BadRequestException('A manager is required');
    await this.assertManager(managerId);
    await this.assertAgent(dto.agentId, managerId);
    if (role === 'SUPERADMIN') {
      await this.assertActiveCompany(dto.companyId);
    } else {
      await this.assertManagedCompany(dto.companyId, managerId);
    }
    const scheduledAt = this.parseFutureDate(dto.scheduledAt);
    await this.assertAssignmentAvailability(
      dto.agentId,
      scheduledAt,
      dto.durationMinutes,
    );
    const assignment = await this.prisma.assignment.create({
      data: {
        company_id: dto.companyId,
        manager_id: managerId,
        agent_id: dto.agentId,
        scheduled_at: scheduledAt,
        duration_minutes: dto.durationMinutes,
        visit_type: dto.visitType,
        priority: dto.priority,
        objectives: dto.objectives,
        reminder_enabled: dto.reminderEnabled ?? true,
        status: AssignmentStatus.ASSIGNED,
      },
      include: { company: true },
    });
    void this.mailService.assignmentCreated(assignment.id);
    return assignment;
  }

  async update(
    id: string,
    actorId: string,
    role: string,
    dto: UpdateAssignmentDto,
  ) {
    const current = await this.prisma.assignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Assignment not found');
    if (role === 'MANAGER' && current.manager_id !== actorId)
      throw new ForbiddenException('You can only manage your own assignments');
    if (role === 'AGENT' && current.agent_id !== actorId)
      throw new ForbiddenException('You can only update your own assignments');
    if (role === 'AGENT') {
      if (
        dto.agentId ||
        dto.companyId ||
        dto.scheduledAt ||
        dto.durationMinutes ||
        dto.visitType ||
        dto.priority ||
        dto.objectives !== undefined
      ) {
        throw new ForbiddenException(
          'Agents can only update the status of their own assignments',
        );
      }
      this.assertAgentStatusTransition(current.status, dto.status);
    } else {
      this.assertManagerStatusTransition(current.status, dto.status);
      if (
        (
          [
            AssignmentStatus.CANCELLED,
            AssignmentStatus.COMPLETED,
          ] as AssignmentStatus[]
        ).includes(current.status) &&
        (dto.agentId ||
          dto.companyId ||
          dto.scheduledAt ||
          dto.durationMinutes !== undefined ||
          dto.visitType ||
          dto.priority ||
          dto.objectives !== undefined)
      ) {
        throw new BadRequestException(
          'Completed or cancelled assignments cannot be edited',
        );
      }
    }
    if (dto.agentId) await this.assertAgent(dto.agentId, current.manager_id);
    if (dto.companyId) {
      if (role === 'SUPERADMIN') {
        await this.assertActiveCompany(dto.companyId);
      } else {
        await this.assertManagedCompany(dto.companyId, current.manager_id);
      }
    }
    const scheduledAt = dto.scheduledAt
      ? this.parseFutureDate(dto.scheduledAt)
      : current.scheduled_at;
    const durationMinutes = dto.durationMinutes ?? current.duration_minutes;
    if (dto.scheduledAt || dto.durationMinutes || dto.agentId) {
      await this.assertAssignmentAvailability(
        dto.agentId ?? current.agent_id,
        scheduledAt,
        durationMinutes,
        current.id,
      );
    }
    if (
      dto.status === AssignmentStatus.CANCELLED &&
      !dto.cancellationReason?.trim()
    ) {
      throw new BadRequestException('A cancellation reason is required');
    }
    const status = dto.status;
    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(dto.companyId && { company_id: dto.companyId }),
        ...(dto.agentId && { agent_id: dto.agentId }),
        ...(dto.scheduledAt && { scheduled_at: scheduledAt }),
        ...(dto.durationMinutes && { duration_minutes: dto.durationMinutes }),
        ...(dto.visitType && { visit_type: dto.visitType }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.objectives !== undefined && { objectives: dto.objectives }),
        ...(dto.reminderEnabled !== undefined && {
          reminder_enabled: dto.reminderEnabled,
        }),
        ...(status && {
          status,
          completed_at:
            status === AssignmentStatus.COMPLETED ? new Date() : null,
          cancellation_reason:
            status === AssignmentStatus.CANCELLED
              ? dto.cancellationReason
              : null,
        }),
      },
      include: { company: true },
    });
    if (role !== 'AGENT') void this.mailService.assignmentChanged(current);
    return updated;
  }

  async remove(id: string, actorId: string, role: string) {
    const current = await this.prisma.assignment.findUnique({
      where: { id },
      include: { company: { select: { name: true } } },
    });
    if (!current) throw new NotFoundException('Assignment not found');
    if (role === 'MANAGER' && current.manager_id !== actorId)
      throw new ForbiddenException('You can only manage your own assignments');
    await this.prisma.assignment.delete({ where: { id } });
    void this.mailService.assignmentRemoved(current);
    return { id };
  }

  private async assertManager(id: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        id,
        account_type: AccountType.USER,
        user: { role: UserRole.MANAGER, status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!account) throw new ForbiddenException('Invalid manager');
  }

  private async assertActiveCompany(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, status: CompanyStatus.ACTIVE },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
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
    const account = await this.prisma.account.findFirst({
      where: {
        id,
        account_type: AccountType.USER,
        user: { role: UserRole.AGENT, status: 'ACTIVE', manager_id: managerId },
      },
      select: { id: true },
    });
    if (!account)
      throw new ForbiddenException('Agent is not assigned to this manager');
  }

  private parseFutureDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      throw new BadRequestException(
        'The assignment must be scheduled in the future',
      );
    }
    return date;
  }

  private async assertAssignmentAvailability(
    agentId: string,
    scheduledAt: Date,
    durationMinutes: number,
    excludeId?: string,
  ) {
    const candidateEnd = new Date(
      scheduledAt.getTime() + durationMinutes * 60_000,
    );
    const assignments = await this.prisma.assignment.findMany({
      where: {
        agent_id: agentId,
        status: {
          in: [
            AssignmentStatus.PENDING,
            AssignmentStatus.ASSIGNED,
            AssignmentStatus.IN_PROGRESS,
          ],
        },
        ...(excludeId && { id: { not: excludeId } }),
        scheduled_at: { lt: candidateEnd },
      },
      select: { scheduled_at: true, duration_minutes: true },
    });
    const overlaps = assignments.some((assignment) => {
      const end = new Date(
        assignment.scheduled_at.getTime() +
          assignment.duration_minutes * 60_000,
      );
      return scheduledAt < end;
    });
    if (overlaps)
      throw new BadRequestException(
        'The agent already has an assignment at this time',
      );
  }

  private assertAgentStatusTransition(
    current: AssignmentStatus,
    next?: AssignmentStatus,
  ) {
    if (!next) return;
    const allowed =
      (current === AssignmentStatus.PENDING ||
        current === AssignmentStatus.ASSIGNED) &&
      next === AssignmentStatus.IN_PROGRESS;
    const completing =
      current === AssignmentStatus.IN_PROGRESS &&
      next === AssignmentStatus.COMPLETED;
    if (!allowed && !completing) {
      throw new ForbiddenException(
        'Agents can only start or complete their own assignments',
      );
    }
  }

  private assertManagerStatusTransition(
    current: AssignmentStatus,
    next?: AssignmentStatus,
  ) {
    if (!next || current === next) return;
    if (
      current === AssignmentStatus.COMPLETED ||
      current === AssignmentStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Completed or cancelled assignments cannot be changed',
      );
    }
    const allowed =
      next === AssignmentStatus.IN_PROGRESS ||
      next === AssignmentStatus.COMPLETED ||
      next === AssignmentStatus.CANCELLED;
    if (!allowed) {
      throw new BadRequestException('Invalid assignment status transition');
    }
  }
}
