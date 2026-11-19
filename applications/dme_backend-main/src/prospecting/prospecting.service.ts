import { researchView, publicMentions, publicLocationLeads } from './research-evidence';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  ServiceUnavailableException,
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
import { officialContacts, emailCandidates, corroboratedEmailFacts, employeeRangeEvidence } from './contact-enrichment';
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
  phone: true,
  email: true,
  ai_context: true,
  created_at: true,
} satisfies Prisma.CompanySelect;

@Injectable()
export class ProspectingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProspectingService.name);
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private readonly activeRuns = new Set<string>();
  private readonly runSnapshots = new Map<string, Prisma.InputJsonObject[]>();

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
      where: { status: ProspectingRunStatus.RUNNING, id: { notIn: [...this.activeRuns] }, created_at: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
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
      companies: (run.criteria as Record<string, unknown>)?.result_snapshots ?? entries.map(({ company, score_snapshot }) => ({
        ...company,
        score: score_snapshot,
      })),
    }));
  }

  async runStatus(actorId: string, runId: string) {
    const run = await this.prisma.prospectingRun.findFirst({
      where: { id: runId, requested_by_id: actorId },
      select: { id: true, status: true, criteria: true, discovered_count: true,
        qualified_count: true, failure_message: true, created_at: true, completed_at: true },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async report(actorId: string, role: AppRole, companyId: string) {
    const saved = await this.dossier(actorId, role, companyId);
    const data = saved.dossier && typeof saved.dossier === 'object' && !Array.isArray(saved.dossier)
      ? saved.dossier as Record<string, unknown> : {};
    return {
      companyId: saved.companyId, name: saved.name, generatedAt: new Date().toISOString(),
      identityStatus: data.identity_status ?? 'UNKNOWN',
      researchEvidenceQuality: (data.web_research as Record<string, unknown> | undefined)?.evidence_quality ?? 'NOT_ASSESSED',
      facts: data.enriched_facts ?? [], publicMentions: publicMentions(data.public_signals),
      locationLeads: publicLocationLeads(data.web_research),
      scoring: data.scoring ?? null, offers: data.offer_recommendation ?? null,
      limitations: ['Source claims are not independent verification.', 'Unverified public mentions may refer to namesakes.', 'Missing evidence is unknown, not proof of absence.'],
    };
  }

  async dossier(actorId: string, role: AppRole, companyId: string) {
    const company = await this.requireCompanyAccess(actorId, role, companyId);
    return { companyId: company.id, name: company.name, dossier: researchView(company.ai_context) };
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
      profiles: companies.map((company) => ({ id: company.ai_source_id, name: company.name, context: company.ai_context })),
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
    const target = dto.targetCompanies ?? 10;
    if (target > 5 || (dto.suppliedCompanies?.length ?? 0) > 5) {
      const running = await this.prisma.prospectingRun.findFirst({ where: { requested_by_id: actorId, status: ProspectingRunStatus.RUNNING }, select: { id: true } });
      if (running) throw new ConflictException('A prospecting campaign is already running');
    }
    // Freeze legacy history before an explicitly supplied-company refresh.
    // New runs already carry immutable evidence snapshots; no schema migration.
    if (dto.suppliedCompanies) {
      const legacyRuns = await this.prisma.prospectingRun.findMany({
        where: {requested_by_id:actorId, status:ProspectingRunStatus.COMPLETED},
        include: {entries:{include:{company:true}}},
      });
      for (const old of legacyRuns) {
        const oldCriteria = old.criteria as Prisma.InputJsonObject;
        if (Array.isArray(oldCriteria?.result_snapshots)) continue;
        const snapshots = old.entries.map(({company, score_snapshot}) => ({
          id:company.id, ai_source_id:company.ai_source_id, name:company.name,
          sector:company.sector, governorate:company.governorate, score:score_snapshot,
          evidence:company.ai_context as Prisma.InputJsonObject,
        }));
        await this.prisma.prospectingRun.update({where:{id:old.id},data:{criteria:{...oldCriteria,result_snapshots:snapshots}}});
      }
    }
    const run = await this.prisma.prospectingRun.create({
      data: { requested_by_id: actorId, criteria },
    });
    this.runSnapshots.set(run.id, []);
    if (target > 5 || (dto.suppliedCompanies?.length ?? 0) > 5) {
      await this.prisma.prospectingRun.update({ where: { id: run.id }, data: { criteria: { ...criteria, targetCompanies: target, stage: 'QUEUED', progress: { completed: 0, total: target } } } });
      this.activeRuns.add(run.id);
      void this.runLarge(actorId, role, dto, criteria, run.id, target).finally(() => (this.activeRuns.delete(run.id), this.runSnapshots.delete(run.id)));
      return { id: run.id, status: ProspectingRunStatus.RUNNING, discoveredCount: 0, qualifiedCount: 0 };
    }
    try { return await this.processRun(actorId, role, dto, criteria, run.id, 1, 0, 0, target, false); }
    finally { this.runSnapshots.delete(run.id); }
  }

  private async runLarge(actorId: string, role: AppRole, dto: StartProspectingDto,
    criteria: ReturnType<ProspectingService['criteriaData']>, runId: string, target: number) {
    let discovered = 0;
    let qualified = 0;
    let emptyPages = 0;
    let lastStatus = 'NO_COMPANIES';
    try {
      for (let page = 1; page <= 20 && qualified < target && discovered < target * 3; page++) {
        const suppliedCompanies = dto.suppliedCompanies?.slice((page - 1) * 5, page * 5);
        if (dto.suppliedCompanies && !suppliedCompanies?.length) break;
        const batch = await this.processRun(actorId, role,
          { ...dto, suppliedCompanies }, criteria, runId, page, discovered, qualified, target, true);
        discovered = batch.discoveredCount;
        qualified = batch.qualifiedCount;
        lastStatus = batch.pipelineStatus;
        emptyPages = batch.batchCount === 0 ? emptyPages + 1 : 0;
        if (!dto.suppliedCompanies && page >= 12 && emptyPages >= 3) break;
      }
      await this.prisma.prospectingRun.update({ where: { id: runId }, data: {
        status: ProspectingRunStatus.COMPLETED, completed_at: new Date(),
        criteria: { ...criteria, targetCompanies: target, stage: qualified >= target ? 'COMPLETED' : 'COMPLETED_PARTIAL', pipeline_status: qualified >= target ? lastStatus : 'REVIEW_REQUIRED',
          target_met: qualified >= target, qualified_target: target, candidate_budget: target * 3, score_version: 'lead-score-2.1', research_version: 'official-evidence-2.0', result_snapshots: this.runSnapshots.get(runId) ?? [], progress: { completed: qualified, total: target } },
      } });
    } catch (error) {
      if (discovered > 0 && error instanceof ServiceUnavailableException) {
        await this.prisma.prospectingRun.update({ where: { id: runId }, data: {
          status: ProspectingRunStatus.COMPLETED, completed_at: new Date(),
          failure_message: 'La recherche externe est temporairement indisponible. Les entreprises déjà trouvées ont été conservées.',
          criteria: { ...criteria, targetCompanies: target, stage: 'COMPLETED_PARTIAL',
            pipeline_status: 'SOURCES_UNAVAILABLE', target_met: false, result_snapshots: this.runSnapshots.get(runId) ?? [],
            progress: { completed: discovered, total: target } },
        } });
        return;
      }
      this.logger.error(`Prospecting campaign ${runId} stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async processRun(actorId: string, role: AppRole, dto: StartProspectingDto,
    criteria: ReturnType<ProspectingService['criteriaData']>, runId: string, page: number,
    previousDiscovered: number, previousQualified: number, target: number, batched: boolean) {
    const run = { id: runId };
    try {
      await this.prisma.prospectingCriteria.upsert({
        where: { account_id: actorId },
        create: { account_id: actorId, ...criteria },
        update: criteria,
      });
      const { ids, known, profiles } = await this.knownCompanies(actorId);
      const exclusions = dto.suppliedCompanies ? {source_urls:[], names:[], domains:[]} : known;
      await this.prisma.prospectingRun.update({where:{id:run.id},data:{criteria:{...criteria,targetCompanies:target,stage:'DISCOVERY_AND_ENRICHMENT',search_page:page,progress:{completed:previousDiscovered,total:target}}}});
      const campaignId = batched ? `${run.id}-page-${page}` : run.id;
      const result = batched
        ? await this.ai.campaign(campaignId, criteria, undefined, exclusions, dto.suppliedCompanies, page)
        : await this.ai.campaign(campaignId, criteria, undefined, exclusions, dto.suppliedCompanies);
      await this.prisma.prospectingRun.update({where:{id:run.id},data:{criteria:{...criteria,targetCompanies:target,stage:'PERSISTING',search_page:page,pipeline_status:result.pipeline_status,progress:{completed:previousDiscovered,total:target}}}});
      // Each search only adds companies the caller does not hold yet, so every
      // company stays attached to the search that first found it.
      const found = result.offer_recommendations.companies.filter(
        (source) => (dto.suppliedCompanies || !ids.has(source.company_id)) && !(this.runSnapshots.get(runId) ?? []).some(item => item.ai_source_id === source.company_id),
      ).slice(0, target * 3 - previousDiscovered);
      // The directory often has no website. Resolve it separately with Maps
      // evidence before saving the company so the assistant can explain it.
      let nextCompany = 0;
      await Promise.all(Array.from({ length: Math.min(3, found.length) }, async () => {
        while (nextCompany < found.length) {
          const source = found[nextCompany++];
          if (source.web_research || source.identity_status === 'UNRESOLVED_PLACE_ID') continue;
        if (typeof source.website !== 'string' || !source.website) {
          try {
            const resolution = await this.ai.resolveCompanyWebsite(
              source.canonical_name,
              source.governorate,
            );
            if (resolution.status === 'RESOLVED' && resolution.website) {
              source.website = resolution.website;
              source.websites = [resolution.website];
              source.domains = [new URL(resolution.website).hostname.replace(/^www\./, '')];
              source.website_resolution = resolution;
            }
          } catch (error) {
            this.logger.warn(`Website resolution unavailable for ${source.company_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
        if (typeof source.website !== 'string' || !source.website) continue;
        try {
          const collection = await this.ai.collectCompanyWebsite(source.canonical_name, source.website);
          const facts = officialContacts(source.website, collection.pages ?? []);
          source.contact_evidence = facts;
          source.phones = [...new Set([...facts.filter(f => f.field === 'phone').map(f => f.value), ...(source.phones ?? [])])];
          source.emails = [...new Set([...facts.filter(f => f.field === 'email').map(f => f.value), ...(source.emails ?? [])])];
          source.post_resolution_enrichment = {
            status: collection.status,
            pages_collected: collection.pages?.length ?? 0,
            verified_contacts: facts.length,
            warnings: collection.warnings ?? [],
          };
        } catch (error) {
          this.logger.warn(`Contact enrichment unavailable for ${source.company_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        // Reuse company-level evidence from a previously saved branch only
        // when Maps has resolved both branches to the same brand domain.
        const websiteHost = new URL(source.website).hostname.toLowerCase().replace(/^www\./, '');
        const brand = source.canonical_name.toLowerCase().match(/^[a-z0-9]{5,}/)?.[0];
        const prior = brand ? profiles.find((profile) => {
          if (!profile.name.toLowerCase().startsWith(brand)) return false;
          const context = profile.context;
          if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
          try { return new URL((context as { website?: string }).website ?? '').hostname.toLowerCase().replace(/^www\./, '') === websiteHost; }
          catch { return false; }
        }) : undefined;
        if (prior?.context && typeof prior.context === 'object' && !Array.isArray(prior.context)) {
          const context = prior.context as Record<string, unknown>;
          const priorFacts = Array.isArray(context.contact_evidence) ? context.contact_evidence.filter((fact) =>
            !!fact && typeof fact === 'object' && ['official_website', 'public_search_corroborated'].includes((fact as { source_name?: string }).source_name ?? '')
            && typeof (fact as { source_url?: string }).source_url === 'string') : [];
          const existingFacts = Array.isArray(source.contact_evidence) ? source.contact_evidence : [];
          source.contact_evidence = [...existingFacts, ...priorFacts];
          source.phones = [...new Set([...(source.phones ?? []), ...priorFacts.filter((fact) => (fact as { field?: string }).field === 'phone').map((fact) => (fact as { value: string }).value)])];
          source.emails = [...new Set([...(source.emails ?? []), ...priorFacts.filter((fact) => (fact as { field?: string }).field === 'email').map((fact) => (fact as { value: string }).value)])];
          if (source.employee_count == null && source.employee_range == null && typeof context.employee_range === 'string') {
            source.employee_range = context.employee_range;
            source.employee_size_evidence = context.employee_size_evidence;
          }
          source.brand_profile_reuse = { from_company_id: prior.id, method: 'SAME_BRAND_AND_DOMAIN' };
        }
        if (!source.emails?.length) {
          try {
            const first = await this.ai.searchPublicEvidence(`"@${new URL(source.website).hostname.replace(/^www\./, '')}" "${source.canonical_name}"`);
            const candidate = emailCandidates(source.canonical_name, source.website, first.candidates ?? [])[0];
            if (candidate) {
              const second = await this.ai.searchPublicEvidence(`"${candidate.email}"`);
              const facts = corroboratedEmailFacts(source.canonical_name, source.website,
                [...(first.candidates ?? []), ...(second.candidates ?? [])]);
              source.emails = [...new Set([...(source.emails ?? []), ...facts.map(f => f.value)])];
              source.contact_evidence = [...(Array.isArray(source.contact_evidence) ? source.contact_evidence : []), ...facts];
            }
          } catch (error) {
            this.logger.warn(`Email evidence search unavailable for ${source.company_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
        if (source.employee_count == null && source.employee_range == null) {
          try {
            const result = await this.ai.searchPublicEvidence(`site:linkedin.com/company "${source.canonical_name}" "Company size"`);
            const evidence = employeeRangeEvidence(source.canonical_name, source.website, result.candidates ?? []);
            if (evidence) {
              source.employee_range = evidence.range;
              source.employee_size_evidence = evidence;
            }
          } catch (error) {
            this.logger.warn(`Employee-size evidence search unavailable for ${source.company_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
        }
      }));
      for (const source of found) {
        const scoring = source.scoring as typeof source.scoring & { missing_data?: string[] };
        if (scoring.missing_data) scoring.missing_data = scoring.missing_data.filter((field) =>
          !((field === 'website' && source.website)
            || (field === 'email' && source.emails?.length)
            || (field === 'employee_count' && (source.employee_count != null || source.employee_range))),
        );
      }
      return await this.prisma.$transaction(async (tx) => {
        let qualifiedCount = 0;
        for (const source of found) {
          const review = !source.scoring.ready_for_offer_recommendation;
          const confirmedTargetSector = source.scoring.reasons?.includes('Matches a campaign target sector')
            && !source.scoring.missing_data?.includes('confirmed_target_sector');
          const sourcedSector = confirmedTargetSector ? criteria.sector : null;
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
              sector: sourcedSector?.slice(0, 120),
              governorate: source.governorate?.slice(0, 60),
              address: source.address?.slice(0, 500),
              phone: source.phones?.[0]?.slice(0, 30),
              email: source.emails?.[0]?.slice(0, 255),
              ai_score: source.scoring.total_score,
              ai_context: source as unknown as Prisma.InputJsonValue,
            },
            update: {
              sector: sourcedSector?.slice(0, 120) ?? null,
              governorate: source.governorate?.slice(0, 60) ?? null,
              address: source.address?.slice(0, 500) ?? null,
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
              // Keep the original run's entry and score as historical evidence.
              ...(existing ? {} : {run_id: run.id, score_snapshot: company.ai_score, recommendation}),
              ...(existing?.status === ProspectingEntryStatus.REMOVED
                ? { status: ProspectingEntryStatus.SURFACED, removed_at: null }
                : {}),
            },
          });
          this.runSnapshots.get(runId)?.push({id:company.id, ai_source_id:source.company_id, name:source.canonical_name, sector:sourcedSector, governorate:source.governorate ?? null, score:source.scoring.total_score, scoring:source.scoring as unknown as Prisma.InputJsonObject, evidence:source as unknown as Prisma.InputJsonObject});
          if (!review && source.scoring.total_score >= QUALIFIED_AI_SCORE)
            qualifiedCount++;
        }
        const discoveredCount = previousDiscovered + found.length;
        const totalQualified = previousQualified + qualifiedCount;
        await tx.prospectingRun.update({
          where: { id: run.id },
          data: {
            status: batched ? ProspectingRunStatus.RUNNING : ProspectingRunStatus.COMPLETED,
            discovered_count: discoveredCount,
            qualified_count: totalQualified,
            ...(batched ? {} : { completed_at: new Date() }),
            criteria: { ...criteria, targetCompanies: target, pipeline_status: result.pipeline_status, result_snapshots: this.runSnapshots.get(runId) ?? [], score_version:'lead-score-2.1', research_version:'official-evidence-2.0', target_met:totalQualified >= target,
              stage: batched ? 'DISCOVERY_AND_ENRICHMENT' : totalQualified >= target ? 'COMPLETED' : 'COMPLETED_PARTIAL', search_page: page,
              progress:{completed:discoveredCount,total:target} },
          },
        });
        return {
          id: run.id,
          status: batched ? ProspectingRunStatus.RUNNING : ProspectingRunStatus.COMPLETED,
          discoveredCount,
          qualifiedCount: totalQualified,
          batchCount: found.length,
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
    const score = company.ai_score ?? entry?.score_snapshot ?? 0;
    const context = company.ai_context && typeof company.ai_context === 'object' && !Array.isArray(company.ai_context)
      ? company.ai_context as Record<string, unknown> : {};
    const contacts = Array.isArray(context.contact_evidence)
      ? context.contact_evidence.filter((fact): fact is { field: string; value: string; source_url: string } =>
          !!fact && typeof fact === 'object' && typeof fact.field === 'string'
          && typeof fact.value === 'string' && typeof fact.source_url === 'string') : [];
    const website = typeof context.website === 'string' && /^https?:\/\//.test(context.website) ? context.website : null;
    const phones = Array.isArray(context.phones) ? context.phones.filter((value): value is string => typeof value === 'string') : [];
    const emails = Array.isArray(context.emails) ? context.emails.filter((value): value is string => typeof value === 'string') : [];
    const employeeCount = typeof context.employee_count === 'number' && Number.isFinite(context.employee_count)
      ? context.employee_count : null;
    const osmFacts: Array<{ field: string; value: string; source_url: string }> = [];
    if (Array.isArray(context.source_records)) for (const record of context.source_records) {
      if (!record || typeof record !== 'object') continue;
      const evidence = record as { source_name?: unknown; source_url?: unknown; payload?: unknown };
      if (evidence.source_name !== 'openstreetmap' || typeof evidence.source_url !== 'string'
        || !/^https:\/\/www\.openstreetmap\.org\//.test(evidence.source_url)
        || !evidence.payload || typeof evidence.payload !== 'object') continue;
      const payload = evidence.payload as Record<string, unknown>;
      for (const field of ['category', 'address', 'opening_hours', 'website', 'phone', 'email']) {
        const value = payload[field];
        if (typeof value === 'string' && value.trim() && value.length <= 500)
          osmFacts.push({ field, value: value.trim(), source_url: evidence.source_url });
      }
      if (payload.social_profiles && typeof payload.social_profiles === 'object')
        for (const [field, value] of Object.entries(payload.social_profiles))
          if (typeof value === 'string' && /^https?:\/\//.test(value) && value.length <= 500)
            osmFacts.push({ field, value, source_url: evidence.source_url });
    }

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
        context.scoring ? ((context.scoring as Record<string, unknown>).ready_for_offer_recommendation === true ? 'Offres à explorer selon les preuves enregistrées.' : 'Revue requise avant proposition commerciale.') : entry?.recommendation ?? this.recommendation(score, company.notes),
      addedAt: (entry?.created_at ?? company.created_at).toISOString(),
      status: entry?.status ?? ProspectingEntryStatus.SURFACED,
      shortlisted: entry?.status === ProspectingEntryStatus.SHORTLISTED,
      enrichment: {
        qualificationStatus: (context.scoring as Record<string, unknown> | undefined)?.qualification_status ?? 'NEEDS_REVIEW',
        offerReady: (context.scoring as Record<string, unknown> | undefined)?.ready_for_offer_recommendation === true,
        scoreVersion: (context.scoring as Record<string, unknown> | undefined)?.score_version ?? null,
        researchEvidenceQuality: (context.web_research as Record<string, unknown> | undefined)?.evidence_quality ?? 'NOT_ASSESSED',
        researchStatus: context.web_research && typeof context.web_research === 'object'
          ? String((context.web_research as Record<string, unknown>).status ?? '') : null,
        evidence: (Array.isArray(context.enriched_facts) ? context.enriched_facts : []).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const fact = item as Record<string, unknown>;
          if (typeof fact.source_url !== 'string' || !/^https?:\/\//.test(fact.source_url) || typeof fact.value_text !== 'string') return [];
          return [{field:String(fact.field),value:fact.value_text,source_url:fact.source_url,retrieved_at:String(fact.retrieved_at ?? ''),uncertainty:String(fact.uncertainty ?? 'Source claim; not independently verified')}];
        }),
        publicMentions: publicMentions(context.public_signals).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const fact = item as Record<string, unknown>;
          if (typeof fact.source_url !== 'string' || !/^https?:\/\//.test(fact.source_url)) return [];
          return [{title:String(fact.title ?? ''),source_url:fact.source_url,retrieved_at:String(fact.retrieved_at ?? ''),published_at:typeof fact.published_at === 'string' ? fact.published_at : null,source_category:String(fact.source_category ?? 'OTHER_MENTION'),uncertainty:'Unverified public mention; may refer to a namesake'}];
        }),
        locationLeads: publicLocationLeads(context.web_research).map(lead => ({
          source_url:String(lead.source_url),reported_address:String(lead.reported_address ?? ''),reported_city:String(lead.reported_city ?? ''),
          published_at:typeof lead.published_at === 'string' ? lead.published_at : null,retrieved_at:String(lead.retrieved_at),
          claim_status:'UNVERIFIED_COMMUNITY_REPORT',attribution:'© OpenStreetMap contributors',
        })),
        website,
        phones: [...new Set([...phones, ...(company.phone ? [company.phone] : [])])],
        emails: [...new Set([...(company.email ? [company.email] : []), ...emails])],
        employeeCount,
        employeeRange: typeof context.employee_range === 'string' ? context.employee_range : null,
        employeeSizeSource: context.employee_size_evidence && typeof context.employee_size_evidence === 'object'
          ? (context.employee_size_evidence as { source_url?: string }).source_url ?? null : null,
        contactEvidence: contacts,
        osmFacts,
        profileScope: context.brand_profile_reuse ? 'brand' : 'company',
        websiteEvidence: context.website_resolution && typeof context.website_resolution === 'object'
          ? (context.website_resolution as { evidence?: Array<{ source_url?: string }> }).evidence?.[0]?.source_url ?? null : null,
      },
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
