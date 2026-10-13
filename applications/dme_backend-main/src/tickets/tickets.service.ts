import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignTicketDto,
  CreateTicketDto,
  CreateTicketReplyDto,
  ListTicketsQueryDto,
  UpdateTicketDto,
} from './dto/ticket.dto';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async list(actorId: string, role: string, query: ListTicketsQueryDto) {
    const where: Record<string, unknown> = {};
    if (role !== 'SUPERADMIN') where.created_by_id = actorId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.relatedCompanyId)
      where.related_company_id = query.relatedCompanyId;
    if (query.from || query.to) {
      where.created_at = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lt: new Date(query.to) }),
      };
    }
    const search = query.q?.trim();
    if (search) {
      const number = Number(search.replace(/^#?(TCK-)?0*/i, ''));
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
      ];
    }

    return this.prisma.ticket.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: this.listSelect(),
    });
  }

  async stats(actorId: string, role: string) {
    const where = role === 'SUPERADMIN' ? {} : { created_by_id: actorId };
    const [total, newCount, inProgress, resolved] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.count({
        where: { ...where, status: TicketStatus.NEW },
      }),
      this.prisma.ticket.count({
        where: { ...where, status: TicketStatus.IN_PROGRESS },
      }),
      this.prisma.ticket.count({
        where: { ...where, status: TicketStatus.RESOLVED },
      }),
    ]);
    return { total, new: newCount, inProgress, resolved };
  }

  async get(id: string, actorId: string, role: string) {
    const raw = await this.findTicket(id);
    this.assertReadAccess(raw, actorId, role);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: this.listSelect(),
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async getAttachment(id: string, actorId: string, role: string) {
    const ticket = await this.findTicket(id);
    this.assertReadAccess(ticket, actorId, role);
    if (!ticket.attachment_data) throw new NotFoundException('No attachment');
    return {
      data: ticket.attachment_data,
      filename: ticket.attachment_name ?? 'attachment',
      mime: ticket.attachment_mime ?? 'application/octet-stream',
    };
  }

  async create(
    actorId: string,
    dto: CreateTicketDto,
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    role = 'SUPERADMIN',
  ) {
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      throw new ForbiddenException('Attachment exceeds the 5 MB limit');
    }
    const subject = dto.subject.trim();
    const description = dto.description.trim();
    if (!subject || !description) {
      throw new BadRequestException(
        'Ticket subject and description are required',
      );
    }
    const links = await this.resolveLinks(actorId, role, dto);
    const ticket = await this.prisma.ticket.create({
      data: {
        ...links,
        type: dto.type,
        subject,
        description,
        priority: dto.priority ?? undefined,
        created_by_id: actorId,
        ...(file && {
          attachment_name: file.originalname,
          attachment_mime: file.mimetype,
          attachment_data: new Uint8Array(file.buffer),
        }),
      },
      select: this.listSelect(),
    });
    void this.mailService.ticketCreated(ticket.id);
    return ticket;
  }

  async update(
    id: string,
    _actorId: string,
    role: string,
    dto: UpdateTicketDto,
  ) {
    if (role !== 'SUPERADMIN') {
      throw new ForbiddenException('Only an administrator can manage tickets');
    }
    const ticket = await this.findTicket(id);
    const status = dto.status ?? ticket.status;
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.status && {
          status,
          resolved_at:
            status === TicketStatus.RESOLVED ? new Date() : undefined,
        }),
        ...(dto.priority && { priority: dto.priority }),
      },
      select: this.listSelect(),
    });
    void this.mailService.ticketStatusChanged(id, ticket.status);
    return updated;
  }

  async addReply(
    id: string,
    actorId: string,
    role: string,
    dto: CreateTicketReplyDto,
  ) {
    if (role !== 'SUPERADMIN') {
      throw new ForbiddenException('Only an administrator can manage tickets');
    }
    const message = dto.message.trim();
    if (!message) throw new BadRequestException('Reply message is required');
    await this.findTicket(id);
    await this.prisma.ticketReply.create({
      data: {
        ticket_id: id,
        author_id: actorId,
        message,
      },
    });
    void this.mailService.ticketReplied(id, actorId, message);
    return this.prisma.ticket.findUnique({
      where: { id },
      select: this.listSelect(),
    });
  }

  async assign(
    id: string,
    actorId: string,
    role: string,
    dto: AssignTicketDto,
  ) {
    if (role !== 'SUPERADMIN') {
      throw new ForbiddenException('Only an administrator can manage tickets');
    }
    await this.findTicket(id);
    if (dto.assigneeId) {
      const assignee = await this.prisma.account.findFirst({
        where: { id: dto.assigneeId, account_type: 'SUPERADMIN' },
      });
      if (!assignee)
        throw new NotFoundException('Assignee must be an administrator');
    }
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { assigned_to_id: dto.assigneeId ?? null },
      select: this.listSelect(),
    });
    void this.mailService.ticketAssigned(id, actorId);
    return updated;
  }

  async listAssignees(role: string) {
    if (role !== 'SUPERADMIN') {
      throw new ForbiddenException('Only an administrator can manage tickets');
    }
    const admins = await this.prisma.account.findMany({
      where: { account_type: 'SUPERADMIN' },
      include: {
        superadmin: {
          select: { first_name: true, last_name: true, email: true },
        },
      },
    });
    return admins
      .filter((admin) => admin.superadmin)
      .map((admin) => ({
        id: admin.id,
        name: `${admin.superadmin!.first_name} ${admin.superadmin!.last_name}`,
        email: admin.superadmin!.email,
      }));
  }

  /**
   * Checks the company / visit a ticket is attached to. Users can only attach
   * a visit they take part in, or a company they work with; admins anything.
   */
  private async resolveLinks(
    actorId: string,
    role: string,
    dto: CreateTicketDto,
  ) {
    let companyId = dto.relatedCompanyId ?? null;
    let meetingId: string | null = null;
    if (dto.relatedMeetingId) {
      const meeting = await this.prisma.prospectingMeeting.findUnique({
        where: { id: dto.relatedMeetingId },
        select: {
          id: true,
          company_id: true,
          agent_id: true,
          manager_id: true,
        },
      });
      const canSee =
        meeting &&
        (role === 'SUPERADMIN' ||
          meeting.agent_id === actorId ||
          meeting.manager_id === actorId);
      if (!canSee) throw new BadRequestException('Unknown visit');
      if (companyId && companyId !== meeting.company_id) {
        throw new BadRequestException(
          'The visit does not belong to that company',
        );
      }
      meetingId = meeting.id;
      companyId = meeting.company_id;
    } else if (companyId) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          ...(role === 'MANAGER' && { manager_id: actorId }),
          ...(role === 'AGENT' && {
            OR: [
              { assignments: { some: { agent_id: actorId } } },
              { meetings: { some: { agent_id: actorId } } },
            ],
          }),
        },
        select: { id: true },
      });
      if (!company) throw new BadRequestException('Unknown company');
    }
    return { related_company_id: companyId, related_meeting_id: meetingId };
  }

  private listSelect() {
    return {
      id: true,
      number: true,
      type: true,
      subject: true,
      description: true,
      priority: true,
      status: true,
      attachment_name: true,
      created_at: true,
      resolved_at: true,
      related_company: { select: { id: true, name: true } },
      related_meeting: {
        select: { id: true, title: true, scheduled_at: true },
      },
      created_by: {
        include: {
          user: { select: { first_name: true, last_name: true } },
          superadmin: { select: { first_name: true, last_name: true } },
        },
      },
      assigned_to: {
        include: {
          superadmin: { select: { first_name: true, last_name: true } },
        },
      },
      replies: {
        orderBy: { created_at: 'asc' as const },
        select: {
          id: true,
          message: true,
          created_at: true,
          author: {
            include: {
              user: { select: { first_name: true, last_name: true } },
              superadmin: { select: { first_name: true, last_name: true } },
            },
          },
        },
      },
    } as const;
  }

  private async findTicket(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private assertReadAccess(
    ticket: { created_by_id: string },
    actorId: string,
    role: string,
  ) {
    if (role === 'SUPERADMIN') return;
    if (ticket.created_by_id === actorId) return;
    throw new ForbiddenException('You do not have access to this ticket');
  }
}
