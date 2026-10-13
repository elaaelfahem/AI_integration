import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  CompanyStatus,
  MeetingStatus,
  Prisma,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { APP_ROLES, AppRole } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { QUALIFIED_AI_SCORE } from '../prospecting/prospecting.constants';

const activeMeetingStatuses = {
  in: [MeetingStatus.SCHEDULED, MeetingStatus.IN_PROGRESS],
};

const openAssignmentStatus = {
  notIn: [AssignmentStatus.CANCELLED, AssignmentStatus.COMPLETED],
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actorId: string, role: AppRole) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.getSnapshot(actorId, role);
      } catch (error) {
        if (!isTransientDatabaseError(error) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }

    throw new Error('Dashboard could not be loaded');
  }

  private async getSnapshot(actorId: string, role: AppRole) {
    const now = new Date();
    const companyScope = this.companyScope(actorId, role);
    const meetingScope = this.meetingScope(actorId, role);
    const ticketScope =
      role === APP_ROLES.SUPERADMIN ? {} : { created_by_id: actorId };

    const [
      totalCompanies,
      aiProspects,
      upcomingVisits,
      openTickets,
      upcomingMeetings,
      unassignedCompanies,
      team,
    ] = await Promise.all([
      this.prisma.company.count({
        where: { ...companyScope, status: CompanyStatus.ACTIVE },
      }),
      this.prisma.company.count({
        where: {
          ...companyScope,
          status: CompanyStatus.ACTIVE,
          ai_score: { gte: QUALIFIED_AI_SCORE },
        },
      }),
      this.prisma.prospectingMeeting.count({
        where: {
          ...meetingScope,
          status: activeMeetingStatuses,
          scheduled_at: { gte: now },
        },
      }),
      this.prisma.ticket.count({
        where: {
          ...ticketScope,
          status: { in: [TicketStatus.NEW, TicketStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.prospectingMeeting.findMany({
        where: {
          ...meetingScope,
          status: activeMeetingStatuses,
          scheduled_at: { gte: now },
        },
        include: {
          company: { select: { name: true } },
          agent: {
            include: {
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
        orderBy: { scheduled_at: 'asc' },
        take: 5,
      }),
      // AND keeps the role scope intact; spreading it into the same object
      // let `assignments`/`manager_id` silently overwrite the scope.
      this.prisma.company.count({
        where: {
          AND: [
            companyScope,
            {
              status: CompanyStatus.ACTIVE,
              assignments: {
                none: { status: { not: AssignmentStatus.CANCELLED } },
              },
            },
          ],
        },
      }),
      this.team(actorId, role),
    ]);

    const priorities = [
      ...(openTickets > 0
        ? [
            {
              id: 'tickets',
              count: openTickets,
              badge: 'Urgent',
              badgeType: 'urgent' as const,
              title: `${openTickets} ticket${openTickets === 1 ? '' : 's'} ouvert${openTickets === 1 ? '' : 's'}`,
              subtitle: 'Demandes nécessitant un suivi.',
              href: '/tickets',
            },
          ]
        : []),
      ...(unassignedCompanies > 0
        ? [
            {
              id: 'unassigned-companies',
              count: unassignedCompanies,
              badge: 'À assigner',
              badgeType: 'assign' as const,
              title: `${unassignedCompanies} entreprise${unassignedCompanies === 1 ? '' : 's'} non assignée${unassignedCompanies === 1 ? '' : 's'}`,
              subtitle: 'Entreprises actives sans agent commercial dédié.',
              href: '/assignments',
            },
          ]
        : []),
      ...(upcomingVisits > 0
        ? [
            {
              id: 'upcoming-visits',
              count: upcomingVisits,
              badge: 'À venir',
              badgeType: 'pending' as const,
              title: `${upcomingVisits} visite${upcomingVisits === 1 ? '' : 's'} à venir`,
              subtitle: 'Rendez-vous planifiés dans votre périmètre.',
              href: '/meetings',
            },
          ]
        : []),
    ];

    return {
      stats: {
        totalCompanies,
        aiProspects,
        upcomingVisits,
        openTickets,
      },
      priorities,
      visits: upcomingMeetings.map((meeting) => ({
        company: meeting.company.name,
        agent: meeting.agent?.user
          ? `${meeting.agent.user.first_name} ${meeting.agent.user.last_name}`
          : '—',
        date: meeting.scheduled_at.toISOString(),
        status:
          meeting.status === MeetingStatus.IN_PROGRESS
            ? ('CONFIRMED' as const)
            : ('PENDING' as const),
        statusLabel:
          meeting.status === MeetingStatus.IN_PROGRESS
            ? 'En cours'
            : 'Planifiée',
      })),
      team,
    };
  }

  private async team(actorId: string, role: AppRole) {
    const hasOpenAssignment = {
      account: {
        assignments_agent: { some: { status: openAssignmentStatus } },
      },
    };
    const hasNoOpenAssignment = {
      account: {
        assignments_agent: { none: { status: openAssignmentStatus } },
      },
    };
    const activeAgent = { role: UserRole.AGENT, status: 'ACTIVE' as const };

    if (role === APP_ROLES.SUPERADMIN) {
      const [managers, agents, availableAgents] = await Promise.all([
        this.prisma.user.count({
          where: { role: UserRole.MANAGER, status: 'ACTIVE' },
        }),
        this.prisma.user.count({ where: activeAgent }),
        this.prisma.user.count({
          where: { ...activeAgent, ...hasNoOpenAssignment },
        }),
      ]);
      return {
        title: 'Équipe',
        items: [
          {
            key: 'activeManagers' as const,
            icon: 'orange' as const,
            label: 'Managers actifs',
            value: managers.toString(),
          },
          {
            key: 'activeAgents' as const,
            icon: 'blue' as const,
            label: 'Agents actifs',
            value: agents.toString(),
          },
          {
            key: 'agentsWithoutAssignment' as const,
            icon: 'yellow' as const,
            label: 'Agents sans assignation',
            value: availableAgents.toString(),
            note: 'disponibles',
          },
        ],
      };
    }

    if (role === APP_ROLES.MANAGER) {
      const team = { ...activeAgent, manager_id: actorId };
      const [agents, assignedAgents, availableAgents] = await Promise.all([
        this.prisma.user.count({ where: team }),
        this.prisma.user.count({ where: { ...team, ...hasOpenAssignment } }),
        this.prisma.user.count({ where: { ...team, ...hasNoOpenAssignment } }),
      ]);
      return {
        title: 'Mon équipe',
        items: [
          {
            key: 'supervisedAgents' as const,
            icon: 'orange' as const,
            label: 'Agents sous supervision',
            value: agents.toString(),
          },
          {
            key: 'agentsWithAssignment' as const,
            icon: 'blue' as const,
            label: 'Agents avec assignation',
            value: assignedAgents.toString(),
          },
          {
            key: 'agentsWithoutAssignment' as const,
            icon: 'yellow' as const,
            label: 'Agents sans assignation',
            value: availableAgents.toString(),
            note: 'disponibles',
          },
        ],
      };
    }

    const [assignments, upcomingVisits] = await Promise.all([
      this.prisma.assignment.count({
        where: { agent_id: actorId, status: openAssignmentStatus },
      }),
      this.prisma.prospectingMeeting.count({
        where: {
          agent_id: actorId,
          status: activeMeetingStatuses,
          scheduled_at: { gte: new Date() },
        },
      }),
    ]);

    return {
      title: 'Mon activité',
      items: [
        {
          key: 'myAssignments' as const,
          icon: 'orange' as const,
          label: 'Mes assignations',
          value: assignments.toString(),
        },
        {
          key: 'myUpcomingVisits' as const,
          icon: 'blue' as const,
          label: 'Mes visites à venir',
          value: upcomingVisits.toString(),
        },
      ],
    };
  }

  private companyScope(
    actorId: string,
    role: AppRole,
  ): Prisma.CompanyWhereInput {
    if (role === APP_ROLES.SUPERADMIN) return {};
    if (role === APP_ROLES.MANAGER) return { manager_id: actorId };
    return {
      assignments: {
        some: {
          agent_id: actorId,
          status: { not: AssignmentStatus.CANCELLED },
        },
      },
    };
  }

  private meetingScope(
    actorId: string,
    role: AppRole,
  ): Prisma.ProspectingMeetingWhereInput {
    if (role === APP_ROLES.MANAGER) return { manager_id: actorId };
    if (role === APP_ROLES.AGENT) return { agent_id: actorId };
    return {};
  }
}

function isTransientDatabaseError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code?.toUpperCase();
  const message = error.message.toLowerCase();
  return (
    ['ETIMEDOUT', 'P1001', 'P1002', 'P2024'].includes(code ?? '') ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection reset by peer')
  );
}
