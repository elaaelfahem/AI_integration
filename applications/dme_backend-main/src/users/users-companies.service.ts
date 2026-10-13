import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  CompanyStatus,
  MeetingStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findVisits, type Visit } from '../visits/visits';

const ALL_MEETING_STATUSES = Object.values(MeetingStatus).filter(
  (status) => status !== MeetingStatus.CANCELLED,
);
const ALL_ASSIGNMENT_STATUSES = Object.values(AssignmentStatus).filter(
  (status) => status !== AssignmentStatus.CANCELLED,
);
const DONE: string[] = [MeetingStatus.COMPLETED, AssignmentStatus.COMPLETED];

/**
 * "Entreprises assignées" for one user: the companies a manager manages, or
 * the companies an agent has visits with, plus visit stats per company.
 */
@Injectable()
export class UsersCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actorId: string,
    actorRole: string,
    userId: string,
    now = new Date(),
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, manager_id: true, status: true },
    });
    if (!user || user.status === 'DELETED') {
      throw new NotFoundException('User not found');
    }
    const allowed =
      actorRole === 'SUPERADMIN' ||
      actorId === userId ||
      (actorRole === 'MANAGER' && user.manager_id === actorId);
    if (!allowed) {
      throw new ForbiddenException(
        'You can only see your own companies or your agents’',
      );
    }

    const isManager = user.role === UserRole.MANAGER;
    const visits = await findVisits(this.prisma, {
      scope: isManager ? { managerId: userId } : { agentId: userId },
      meetingStatuses: ALL_MEETING_STATUSES,
      assignmentStatuses: ALL_ASSIGNMENT_STATUSES,
    });
    const byCompany = new Map<string, Visit[]>();
    for (const visit of visits) {
      byCompany.set(visit.company.id, [
        ...(byCompany.get(visit.company.id) ?? []),
        visit,
      ]);
    }

    // A manager's companies are the ones they manage; an agent's are the ones
    // they have (or had) visits with.
    const companyIds = isManager
      ? (
          await this.prisma.company.findMany({
            where: { manager_id: userId, status: CompanyStatus.ACTIVE },
            select: { id: true },
          })
        ).map((company) => company.id)
      : [...byCompany.keys()];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: {
        id: true,
        name: true,
        sector: true,
        governorate: true,
        address: true,
        status: true,
        ai_score: true,
        client_category: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      userId,
      role: user.role,
      relation: isManager ? 'MANAGED' : 'VISITS',
      total: companies.length,
      companies: companies.map((company) => {
        const companyVisits = byCompany.get(company.id) ?? [];
        const past = companyVisits.filter((visit) =>
          DONE.includes(visit.status),
        );
        const upcoming = companyVisits.filter(
          (visit) => !DONE.includes(visit.status) && visit.scheduledAt >= now,
        );
        return {
          id: company.id,
          name: company.name,
          sector: company.sector,
          governorate: company.governorate,
          address: company.address,
          status: company.status,
          aiScore: company.ai_score,
          clientCategory: company.client_category,
          visits: {
            total: companyVisits.length,
            completed: past.length,
            upcoming: upcoming.length,
          },
          lastVisitAt: past.at(-1)?.scheduledAt.toISOString() ?? null,
          nextVisitAt: upcoming[0]?.scheduledAt.toISOString() ?? null,
        };
      }),
    };
  }
}
