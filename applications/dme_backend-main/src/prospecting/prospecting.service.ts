import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyStatus,
  Prisma,
  ProspectingEntryStatus,
  ProspectingRunStatus,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { APP_ROLES, AppRole } from '../auth/auth.types';
import { AssignmentsService } from '../assignments/assignments.service';
import { CreateAssignmentDto } from '../assignments/dto/assignment.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PRIORITY_AI_SCORE, QUALIFIED_AI_SCORE } from './prospecting.constants';
import {
  AssignProspectDto,
  StartProspectingDto,
  UpdateProspectingCriteriaDto,
} from './dto/prospecting.dto';

const companySelect = {
  id: true,
  name: true,
  sector: true,
  governorate: true,
  delegation: true,
  ai_score: true,
  notes: true,
  created_at: true,
} satisfies Prisma.CompanySelect;

@Injectable()
export class ProspectingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProspectingService.name);
  private recoveryTimer?: ReturnType<typeof setInterval>;

  async onModuleInit() {
    await this.recoverExpiredRuns();
    this.recoveryTimer = setInterval(() => {
      void this.recoverExpiredRuns().catch(() => this.logger.error('Could not recover expired prospecting runs'));
    }, 60000);
    this.recoveryTimer.unref();
  }

  onModuleDestroy() { if (this.recoveryTimer) clearInterval(this.recoveryTimer); }

  async recoverExpiredRuns() {
    // Upstream requests time out after five minutes. Allow a ten-minute lease
    // so another running instance's valid request is never interrupted.
    return this.prisma.prospectingRun.updateMany({
      where: { status: ProspectingRunStatus.RUNNING, created_at: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      data: { status: ProspectingRunStatus.FAILED, completed_at: new Date(),
        failure_message: 'La recherche a été interrompue ou a dépassé le délai autorisé. Vous pouvez la relancer.' },
    });
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly ai: AiService,
  ) {}

  async list(actorId: string, role: AppRole) {
    const criteria = await this.getCriteria(actorId);
    const companies = await this.findCompanies(actorId, role, criteria);
    const entries = await this.prisma.prospectingEntry.findMany({
      where: {
        added_by_id: actorId,
        company_id: { in: companies.map(({ id }) => id) },
      },
      select: {
        company_id: true,
        status: true,
        created_at: true,
        recommendation: true,
        score_snapshot: true,
      },
    });
    const entryByCompany = new Map(
      entries.map((entry) => [entry.company_id, entry]),
    );

    return companies.map((company) =>
      this.toOpportunity(company, entryByCompany.get(company.id)),
    );
  }

  async getCriteria(actorId: string) {
    const criteria = await this.prisma.prospectingCriteria.findUnique({
      where: { account_id: actorId },
    });

    return {
      sector: criteria?.sector ?? null,
      governorate: criteria?.governorate ?? null,
      employeeRange: criteria?.employee_range ?? null,
      query: criteria?.query ?? null,
    };
  }

  async updateCriteria(actorId: string, dto: UpdateProspectingCriteriaDto) {
    const data = this.criteriaData(dto);
    const criteria = await this.prisma.prospectingCriteria.upsert({
      where: { account_id: actorId },
      create: { account_id: actorId, ...data },
      update: data,
    });
    return {
      sector: criteria.sector,
      governorate: criteria.governorate,
      employeeRange: criteria.employee_range,
      query: criteria.query,
    };
  }

  async history(actorId: string) {
    const runs = await this.prisma.prospectingRun.findMany({
      where: { requested_by_id: actorId },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        criteria: true,
        discovered_count: true,
        qualified_count: true,
        failure_message: true,
        created_at: true,
        completed_at: true,
        entries: {
          orderBy: { score_snapshot: 'desc' },
          select: {
            score_snapshot: true,
            company: {
              select: { id: true, name: true, sector: true, governorate: true },
            },
          },
        },
      },
    });
    return runs.map(({ entries, ...run }) => ({
      ...run,
      companies: entries.map(({ company, score_snapshot }) => ({
        ...company,
        score: score_snapshot,
      })),
    }));
  }

  private async knownCompanies(actorId: string) {
    const companies = await this.prisma.company.findMany({
      where: { created_by_id: actorId, ai_source_id: { not: null } },
      select: { ai_source_id: true, name: true, ai_context: true },
    });
    const source_urls = new Set<string>();
    const domains = new Set<string>();
    for (const { ai_context } of companies) {
      if (!ai_context || typeof ai_context !== 'object' || Array.isArray(ai_context))
        continue;
      const context = ai_context as {
        source_records?: Array<{ source_url?: unknown }>;
        domains?: unknown[];
      };
      for (const record of context.source_records ?? [])
        if (typeof record?.source_url === 'string')
          source_urls.add(record.source_url);
      for (const domain of context.domains ?? [])
        if (typeof domain === 'string') domains.add(domain);
    }
    return {
      ids: new Set(companies.map((company) => company.ai_source_id)),
      known: {
        source_urls: [...source_urls],
        names: companies.map((company) => company.name),
        domains: [...domains],
      },
    };
  }

  async start(actorId: string, role: AppRole, dto: StartProspectingDto) {
    if (role === APP_ROLES.AGENT)
      throw new ForbiddenException(
        'Only managers and administrators can discover new companies',
      );
    const criteria = this.criteriaData(dto);
    const run = await this.prisma.prospectingRun.create({
      data: { requested_by_id: actorId, criteria },
    });

    try {
      await this.prisma.prospectingCriteria.upsert({
        where: { account_id: actorId },
        create: { account_id: actorId, ...criteria },
        update: criteria,
      });
      const { ids, known } = await this.knownCompanies(actorId);
      const result = await this.ai.campaign(run.id, criteria, undefined, known);
      // Each search only adds companies the caller does not hold yet, so every
      // company stays attached to the search that first found it.
      const found = result.offer_recommendations.companies.filter(
        (source) => !ids.has(source.company_id),
      );
      return await this.prisma.$transaction(async (tx) => {
        let qualifiedCount = 0;
        for (const source of found) {
          const review = !source.scoring.ready_for_offer_recommendation;
          const recommendations =
            source.offer_recommendation?.recommendations
              ?.map((offer) => offer.offer_name)
              .join(', ') || '';
          const recommendation = [
            review
              ? 'Revue requise avant proposition commerciale.'
              : 'Offres à explorer : ' + recommendations,
            ...(source.offer_recommendation?.warnings || []),
          ]
            .join(' ')
            .slice(0, 1000);
          const company = await tx.company.upsert({
            where: {
              created_by_id_ai_source_id: {
                created_by_id: actorId,
                ai_source_id: source.company_id,
              },
            },
            create: {
              created_by_id: actorId,
              manager_id: role === APP_ROLES.MANAGER ? actorId : null,
              ai_source_id: source.company_id,
              name: source.canonical_name.slice(0, 255),
              sector: source.sector?.slice(0, 120),
              governorate: source.governorate?.slice(0, 60),
              address: source.address?.slice(0, 500),
              phone: source.phones?.[0]?.slice(0, 30),
              email: source.emails?.[0]?.slice(0, 255),
              ai_score: source.scoring.total_score,
              ai_context: source as unknown as Prisma.InputJsonValue,
            },
            update: {
              ai_score: source.scoring.total_score,
              ai_context: source as unknown as Prisma.InputJsonValue,
            },
          });
          const existing = await tx.prospectingEntry.findUnique({
            where: {
              company_id_added_by_id: {
                company_id: company.id,
                added_by_id: actorId,
              },
            },
          });
          await tx.prospectingEntry.upsert({
            where: {
              company_id_added_by_id: {
                company_id: company.id,
                added_by_id: actorId,
              },
            },
            create: {
              company_id: company.id,
              added_by_id: actorId,
              run_id: run.id,
              score_snapshot: company.ai_score,
              recommendation,
            },
            update: {
              run_id: run.id,
              score_snapshot: company.ai_score,
              recommendation,
              ...(existing?.status === ProspectingEntryStatus.REMOVED
                ? { status: ProspectingEntryStatus.SURFACED, removed_at: null }
                : {}),
            },
          });
          if (!review && source.scoring.total_score >= QUALIFIED_AI_SCORE)
            qualifiedCount++;
        }
        const discoveredCount = found.length;
        await tx.prospectingRun.update({
          where: { id: run.id },
          data: {
            status: ProspectingRunStatus.COMPLETED,
            discovered_count: discoveredCount,
            qualified_count: qualifiedCount,
            completed_at: new Date(),
            criteria: { ...criteria, pipeline_status: result.pipeline_status },
          },
        });
        return {
          id: run.id,
          status: ProspectingRunStatus.COMPLETED,
          discoveredCount,
          qualifiedCount,
          pipelineStatus: result.pipeline_status,
        };
      });
    } catch (error) {
      await this.prisma.prospectingRun.update({
        where: { id: run.id },
        data: {
          status: ProspectingRunStatus.FAILED,
          failure_message: this.errorMessage(),
          completed_at: new Date(),
        },
      });
      throw error;
    }
  }

  async addToShortlist(actorId: string, role: AppRole, companyId: string) {
    const company = await this.requireCompanyAccess(actorId, role, companyId);
    const entry = await this.prisma.prospectingEntry.upsert({
      where: {
        company_id_added_by_id: {
          company_id: company.id,
          added_by_id: actorId,
        },
      },
      create: {
        company_id: company.id,
        added_by_id: actorId,
        status: ProspectingEntryStatus.SHORTLISTED,
        score_snapshot: company.ai_score,
        recommendation: this.recommendation(company.ai_score, company.notes),
      },
      update: {
        status: ProspectingEntryStatus.SHORTLISTED,
        removed_at: null,
      },
    });
    return { companyId: entry.company_id, status: entry.status };
  }

  async removeFromShortlist(actorId: string, role: AppRole, companyId: string) {
    await this.requireCompanyAccess(actorId, role, companyId);
    const entry = await this.prisma.prospectingEntry.findUnique({
      where: {
        company_id_added_by_id: { company_id: companyId, added_by_id: actorId },
      },
    });
    if (!entry || entry.status !== ProspectingEntryStatus.SHORTLISTED) {
      throw new NotFoundException('Company is not in your shortlist');
    }
    await this.prisma.prospectingEntry.update({
      where: { id: entry.id },
      data: { status: ProspectingEntryStatus.REMOVED, removed_at: new Date() },
    });
    return { companyId, status: ProspectingEntryStatus.REMOVED };
  }

  async assign(
    actorId: string,
    role: AppRole,
    companyId: string,
    dto: AssignProspectDto,
  ) {
    await this.requireCompanyAccess(actorId, role, companyId);
    const entry = await this.prisma.prospectingEntry.findUnique({
      where: {
        company_id_added_by_id: { company_id: companyId, added_by_id: actorId },
      },
    });
    if (!entry || entry.status !== ProspectingEntryStatus.SHORTLISTED) {
      throw new ConflictException('Only shortlisted companies can be assigned');
    }

    const assignment = await this.assignments.create(actorId, role, {
      companyId,
      agentId: dto.agentId,
      managerId: dto.managerId,
      scheduledAt: dto.scheduledAt,
      durationMinutes: 60,
      visitType: 'FIRST_VISIT',
      priority: 'MEDIUM',
    } satisfies CreateAssignmentDto);

    await this.prisma.prospectingEntry.update({
      where: { id: entry.id },
      data: { status: ProspectingEntryStatus.ASSIGNED },
    });
    return assignment;
  }

  private async findCompanies(
    actorId: string,
    role: AppRole,
    criteria: {
      sector: string | null;
      governorate: string | null;
      employeeRange: string | null;
      query: string | null;
    },
  ) {
    const filters: Prisma.CompanyWhereInput = {
      status: CompanyStatus.ACTIVE,
      ...this.scopeWhere(actorId, role),
      ...(criteria.sector
        ? { sector: { contains: criteria.sector, mode: 'insensitive' } }
        : {}),
      ...(criteria.governorate
        ? {
            governorate: {
              contains: criteria.governorate,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(criteria.query
        ? {
            OR: [
              { name: { contains: criteria.query, mode: 'insensitive' } },
              { sector: { contains: criteria.query, mode: 'insensitive' } },
              { notes: { contains: criteria.query, mode: 'insensitive' } },
              { address: { contains: criteria.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.company.findMany({
      where: {
        status: CompanyStatus.ACTIVE,
        ...this.scopeWhere(actorId, role),
        OR: [
          filters,
          {
            prospecting_entries: {
              some: {
                added_by_id: actorId,
                status: { not: ProspectingEntryStatus.REMOVED },
              },
            },
          },
        ],
      },
      select: companySelect,
      orderBy: [{ ai_score: 'desc' }, { name: 'asc' }],
      take: 500,
    });
  }

  private async requireCompanyAccess(
    actorId: string,
    role: AppRole,
    companyId: string,
  ) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
        ...this.scopeWhere(actorId, role),
      },
      select: companySelect,
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private scopeWhere(actorId: string, role: AppRole): Prisma.CompanyWhereInput {
    if (role === APP_ROLES.SUPERADMIN) return {};
    if (role === APP_ROLES.MANAGER) return { manager_id: actorId };
    return {
      assignments: {
        some: { agent_id: actorId, status: { not: 'CANCELLED' } },
      },
    };
  }

  private criteriaData(dto: UpdateProspectingCriteriaDto) {
    return {
      sector: clean(dto.sector),
      governorate: clean(dto.governorate),
      employee_range: clean(dto.employeeRange),
      query: clean(dto.query),
    };
  }

  private toOpportunity(
    company: Prisma.CompanyGetPayload<{ select: typeof companySelect }>,
    entry?: {
      status: ProspectingEntryStatus;
      created_at: Date;
      recommendation: string | null;
      score_snapshot: number | null;
    },
  ) {
    const score = entry?.score_snapshot ?? company.ai_score ?? 0;
    return {
      id: company.id,
      company: company.name,
      sector: company.sector ?? 'Non renseigné',
      location:
        [company.governorate, company.delegation].filter(Boolean).join(', ') ||
        'Non renseignée',
      score,
      potential: potential(score),
      recommendation:
        entry?.recommendation ?? this.recommendation(score, company.notes),
      addedAt: (entry?.created_at ?? company.created_at).toISOString(),
      status: entry?.status ?? ProspectingEntryStatus.SURFACED,
      shortlisted: entry?.status === ProspectingEntryStatus.SHORTLISTED,
    };
  }

  private recommendation(score: number | null, notes: string | null) {
    if (notes?.trim()) return notes.trim().slice(0, 1000);
    if ((score ?? 0) >= PRIORITY_AI_SCORE)
      return 'Cible prioritaire selon le score IA actuel.';
    if ((score ?? 0) >= QUALIFIED_AI_SCORE)
      return 'Opportunité à qualifier avec un agent.';
    return 'Profil à examiner avant toute prise de contact.';
  }

  private errorMessage() {
    return 'La prospection a échoué. Réessayez ou contactez un administrateur.';
  }
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function potential(score: number) {
  if (score >= PRIORITY_AI_SCORE) return 'Très élevé';
  if (score >= QUALIFIED_AI_SCORE) return 'Élevé';
  return 'Moyen';
}
