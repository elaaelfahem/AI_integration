import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CollectionJobStatus,
  CompanyHistoryAction,
  Prisma,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDataSourceDto,
  StartCollectionJobDto,
  UpdateDataSourceDto,
} from './dto/data-source.dto';

const sourceListInclude = {
  _count: { select: { job_sources: true, evidence: true } },
} satisfies Prisma.DataSourceInclude;

const jobListInclude = {
  sources: { include: { data_source: true } },
  requested_by: {
    include: {
      user: { select: { first_name: true, last_name: true } },
      superadmin: { select: { first_name: true, last_name: true } },
    },
  },
  _count: { select: { evidence: true } },
} satisfies Prisma.CollectionJobInclude;

const SEED_NAME_BY_ID: Record<string, string> = {
  'b1a2c3d4-0001-4000-8000-000000000001':
    'Registre National des Entreprises (RNE)',
  'b1a2c3d4-0000-4000-8000-000000000009': 'Orange DME Historical Data',
  'b1a2c3d4-0002-4000-8000-000000000002': 'Pages Jaunes Tunisie',
  'b1a2c3d4-0003-4000-8000-000000000003': 'Google Maps & Places API',
  'b1a2c3d4-0004-4000-8000-000000000004': 'LinkedIn Business Data',
  'b1a2c3d4-0005-4000-8000-000000000005': 'APII - Industrie & Innovation',
  'b1a2c3d4-0006-4000-8000-000000000006': 'Kompass B2B Tunisie',
  'b1a2c3d4-0007-4000-8000-000000000007': 'Keejob Emploi & Recrutement',
  'b1a2c3d4-0008-4000-8000-000000000008': 'Crawler Web Direct DME',
};

@Injectable()
export class DataSourcesService implements OnModuleInit, OnModuleDestroy {
  private recoveryTimer?: ReturnType<typeof setInterval>;
  async onModuleInit() {
    await this.recoverExpiredJobs();
    this.recoveryTimer = setInterval(() => {
      void this.recoverExpiredJobs().catch(() => this.logger.error('Could not recover expired collection jobs'));
    }, 60000);
    this.recoveryTimer.unref();
  }
  onModuleDestroy() { if (this.recoveryTimer) clearInterval(this.recoveryTimer); }
  async recoverExpiredJobs() {
    return this.prisma.collectionJob.updateMany({
      where: {status:{in:[CollectionJobStatus.QUEUED,CollectionJobStatus.RUNNING]},created_at:{lt:new Date(Date.now()-600000)}},
      data: {status:CollectionJobStatus.FAILED,completed_at:new Date(),failure_message:'La collecte a été interrompue ou a dépassé le délai autorisé. Vous pouvez la relancer.'},
    });
  }

  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly ai: AiService,
  ) {}

  listSources() {
    return this.prisma.dataSource.findMany({
      where: { retired_at: null },
      include: sourceListInclude,
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });
  }

  async createSource(actorId: string, dto: CreateDataSourceDto) {
    const name = requiredName(dto.name);
    try {
      return await this.prisma.dataSource.create({
        data: {
          name,
          type: dto.type,
          collection_method: dto.collectionMethod,
          configuration_reference: cleanOptionalText(
            dto.configurationReference,
          ),
          logo_url: cleanOptionalText(dto.logoUrl),
          description: cleanOptionalText(dto.description),
          enabled: dto.enabled ?? true,
          created_by_id: actorId,
        },
        include: sourceListInclude,
      });
    } catch (error) {
      this.throwDuplicateSource(error);
    }
  }

  async updateSource(id: string, dto: UpdateDataSourceDto) {
    const source = await this.getSource(id);
    const name = dto.name === undefined ? undefined : requiredName(dto.name);
    try {
      return await this.prisma.dataSource.update({
        where: { id: source.id },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.collectionMethod !== undefined && {
            collection_method: dto.collectionMethod,
          }),
          ...(dto.configurationReference !== undefined && {
            configuration_reference: cleanOptionalText(
              dto.configurationReference,
            ),
          }),
          ...(dto.logoUrl !== undefined && {
            logo_url: cleanOptionalText(dto.logoUrl),
          }),
          ...(dto.description !== undefined && {
            description: cleanOptionalText(dto.description),
          }),
          ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        },
        include: sourceListInclude,
      });
    } catch (error) {
      this.throwDuplicateSource(error);
    }
  }

  async setSourceEnabled(id: string, enabled: boolean) {
    const source = await this.getSource(id);
    if (source.retired_at && enabled) {
      throw new ForbiddenException('Retired data sources cannot be enabled');
    }
    return this.prisma.dataSource.update({
      where: { id: source.id },
      data: { enabled },
      include: sourceListInclude,
    });
  }

  async retireSource(id: string) {
    const source = await this.getSource(id);
    const usage = await this.prisma.dataSource.findUnique({
      where: { id: source.id },
      select: {
        _count: { select: { job_sources: true, evidence: true } },
      },
    });

    if (!usage?._count.job_sources && !usage?._count.evidence) {
      await this.prisma.dataSource.delete({
        where: { id: source.id },
      });
      return { id: source.id, deleted: true };
    }

    return this.prisma.dataSource.update({
      where: { id: source.id },
      data: { enabled: false, retired_at: new Date() },
      include: sourceListInclude,
    });
  }

  listJobs() {
    return this.prisma.collectionJob.findMany({
      include: jobListInclude,
      orderBy: { created_at: 'desc' },
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.collectionJob.findUnique({
      where: { id },
      include: {
        ...jobListInclude,
        evidence: {
          include: {
            company: {
              select: { id: true, name: true, sector: true, governorate: true },
            },
            data_source: { select: { id: true, name: true, type: true } },
          },
          orderBy: { collected_at: 'desc' },
        },
      },
    });
    if (!job) throw new NotFoundException('Collection job not found');
    return job;
  }

  async startJob(actorId: string, dto: StartCollectionJobDto) {
    const sourceIds = [...new Set(dto.sourceIds)];
    const sources = await this.prisma.dataSource.findMany({
      where: { id: { in: sourceIds } },
      select: {
        id: true,
        enabled: true,
        retired_at: true,
        configuration_reference: true,
      },
    });

    if (sources.length !== sourceIds.length) {
      throw new NotFoundException(
        'One or more data sources could not be found',
      );
    }
    if (sources.some((source) => !source.enabled || source.retired_at)) {
      throw new ConflictException(
        'Disabled or retired sources cannot be selected',
      );
    }

    if (
      sources.some((source) => !connectorFor(source.configuration_reference))
    ) {
      throw new BadRequestException(
        'Select supported AI connectors: b2b_tn, web_search or google_maps. Other listed sources are not connected.',
      );
    }
    const job = await this.prisma.collectionJob.create({
      data: {
        requested_by_id: actorId,
        filters: this.filtersFrom(dto),
        sources: {
          create: sourceIds.map((dataSourceId) => ({
            data_source_id: dataSourceId,
          })),
        },
      },
      include: jobListInclude,
    });

    void this.runJob(job.id).catch(() => undefined);
    return job;
  }

  private async runJob(jobId: string) {
    try {
      const job = await this.prisma.collectionJob.update({
        where: { id: jobId },
        data: { status: CollectionJobStatus.RUNNING, started_at: new Date() },
        include: { sources: { include: { data_source: true } } },
      });
      const filters = isObject(job.filters) ? job.filters : {};
      const sourceIds = [
        ...new Set(
          job.sources
            .map(({ data_source }) =>
              connectorFor(data_source.configuration_reference),
            )
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      if (!sourceIds.length)
        throw new BadRequestException('No supported AI source selected');
      const result = await this.ai.campaign(
        job.id,
        {
          sector: stringValue(filters.sector),
          governorate: stringValue(filters.governorate),
          query: stringValue(filters.query),
          employee_range: null,
        },
        sourceIds,
      );
      await this.prisma.$transaction(async (tx) => {
        let created = 0;
        for (const candidate of result.offer_recommendations.companies) {
          const key = {
            created_by_id: job.requested_by_id,
            ai_source_id: candidate.company_id,
          };
          const existing = await tx.company.findUnique({
            where: { created_by_id_ai_source_id: key },
          });
          const company = await tx.company.upsert({
            where: { created_by_id_ai_source_id: key },
            create: {
              ...key,
              name: candidate.canonical_name.slice(0, 255),
              sector: candidate.sector?.slice(0, 120),
              governorate: candidate.governorate?.slice(0, 60),
              address: candidate.address?.slice(0, 500),
              phone: candidate.phones?.[0]?.slice(0, 30),
              email: candidate.emails?.[0]?.slice(0, 255),
              ai_score: candidate.scoring.total_score,
              ai_context: candidate as unknown as Prisma.InputJsonValue,
            },
            update: {
              ai_score: candidate.scoring.total_score,
              ai_context: candidate as unknown as Prisma.InputJsonValue,
            },
          });
          if (!existing) created++;
          const evidence = (candidate.source_records || []).flatMap(
            (record) => {
              const selected = job.sources.find(
                ({ data_source }) =>
                  connectorFor(data_source.configuration_reference) ===
                  record.source_name,
              );
              return selected
                ? [
                    {
                      company_id: company.id,
                      data_source_id: selected.data_source.id,
                      collection_job_id: job.id,
                      field_name: 'company_profile',
                      field_value: candidate.canonical_name.slice(0, 1000),
                      reference_label: (
                        record.source_url || record.source_name
                      ).slice(0, 255),
                    },
                  ]
                : [];
            },
          );
          if (evidence.length)
            await tx.companySourceEvidence.createMany({ data: evidence });
          await tx.companyHistory.create({
            data: {
              company_id: company.id,
              actor_id: job.requested_by_id,
              action: existing
                ? CompanyHistoryAction.ENRICHED
                : CompanyHistoryAction.CREATED,
              summary: 'Company returned by the AI discovery pipeline',
              details: {
                collectionJobId: job.id,
                sourceCount: evidence.length,
              },
            },
          });
        }
        const count = result.offer_recommendations.companies.length;
        await tx.collectionJob.update({
          where: { id: job.id },
          data: {
            status: CollectionJobStatus.COMPLETED,
            discovered_count: count,
            created_count: created,
            enriched_count: count - created,
            completed_at: new Date(),
            filters: { ...filters, pipeline_status: result.pipeline_status },
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Collection job ${jobId} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.collectionJob
        .update({
          where: { id: jobId },
          data: {
            status: CollectionJobStatus.FAILED,
            failure_message: this.errorMessage(),
            completed_at: new Date(),
          },
        })
        .then(() => this.mailService.collectionJobFailed(jobId))
        .catch((updateError) => {
          this.logger.error(
            `Collection job ${jobId} could not be marked as failed`,
            updateError instanceof Error
              ? updateError.stack
              : String(updateError),
          );
        });
    }
  }

  private filtersFrom(dto: StartCollectionJobDto): Prisma.InputJsonValue {
    return {
      sector: cleanOptionalText(dto.sector),
      governorate: cleanOptionalText(dto.governorate),
      query: cleanOptionalText(dto.query),
    };
  }

  private async getSource(id: string) {
    let source = await this.prisma.dataSource.findUnique({ where: { id } });

    if (!source) {
      const mappedName = SEED_NAME_BY_ID[id];
      source = await this.prisma.dataSource.findFirst({
        where: {
          OR: [
            { name: { equals: id, mode: 'insensitive' as const } },
            ...(mappedName
              ? [{ name: { equals: mappedName, mode: 'insensitive' as const } }]
              : []),
          ],
        },
      });
    }

    if (!source) throw new NotFoundException('Data source not found');
    return source;
  }

  private throwDuplicateSource(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A data source with this name already exists',
      );
    }
    throw error;
  }

  private errorMessage() {
    return 'La collecte a échoué. Réessayez ou contactez un administrateur.';
  }
}

function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requiredName(value: string) {
  const name = value.trim();
  if (!name) throw new BadRequestException('Data source name is required');
  return name;
}

function isObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function connectorFor(reference: string | null): string | null {
  if (['b2b_tn', 'web_search', 'google_maps'].includes(reference || ''))
    return reference;
  if (reference === 'https://maps.googleapis.com/maps/api/place')
    return 'google_maps';
  if (reference === 'https://www.b2b.tn' || reference === 'https://b2b.tn')
    return 'b2b_tn';
  return null;
}
