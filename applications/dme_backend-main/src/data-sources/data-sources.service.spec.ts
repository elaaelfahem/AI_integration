import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CollectionMethod, DataSourceType } from '@prisma/client';
import { DataSourcesService } from './data-sources.service';

function createPrismaMock() {
  return {
    dataSource: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    collectionJob: {
      updateMany: jest.fn().mockResolvedValue({count:1}),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    company: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    companySourceEvidence: { createMany: jest.fn() },
    companyHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

const aiStub = { campaign: jest.fn() } as never;
const mailStub = new Proxy({}, { get: () => jest.fn() }) as never;

describe('DataSourcesService', () => {
  it('recovers only expired queued or running collection jobs', async () => {
    const prisma = createPrismaMock();
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);
    const before = Date.now();
    await service.recoverExpiredJobs();
    const request = prisma.collectionJob.updateMany.mock.calls[0][0];
    expect(request.where.status.in).toEqual(['QUEUED','RUNNING']);
    expect(request.where.created_at.lt.getTime()).toBeLessThanOrEqual(before - 600000 + 50);
    expect(request.data.status).toBe('FAILED');
  });
  const actorId = '4fe7c7c2-2d0a-4f8c-8d18-57a7f95166a1';
  const sourceId = '02a5e6c8-2dd9-4c4f-9db0-50d9a8a11e8d';
  const dto = {
    name: 'RNE',
    type: DataSourceType.OFFICIAL_REGISTRY,
    collectionMethod: CollectionMethod.API,
    configurationReference: 'Public directory lookup',
  };

  it('normalizes the source name and keeps only an operational reference', async () => {
    const prisma = createPrismaMock();
    prisma.dataSource.create.mockResolvedValue({ id: sourceId, name: 'RNE' });
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(
      service.createSource(actorId, { ...dto, name: ' RNE ' }),
    ).resolves.toEqual({
      id: sourceId,
      name: 'RNE',
    });
    expect(prisma.dataSource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'RNE',
          configuration_reference: 'Public directory lookup',
          created_by_id: actorId,
        }),
      }),
    );
  });

  it('rejects a whitespace-only source name', async () => {
    const prisma = createPrismaMock();
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(
      service.createSource(actorId, { ...dto, name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dataSource.create).not.toHaveBeenCalled();
  });

  it('rejects disabled sources before creating a collection job', async () => {
    const prisma = createPrismaMock();
    prisma.dataSource.findMany.mockResolvedValue([
      { id: sourceId, enabled: false, retired_at: null },
    ]);
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(
      service.startJob(actorId, { sourceIds: [sourceId] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.collectionJob.create).not.toHaveBeenCalled();
  });

  it('rejects missing source identifiers before creating a collection job', async () => {
    const prisma = createPrismaMock();
    prisma.dataSource.findMany.mockResolvedValue([]);
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(
      service.startJob(actorId, { sourceIds: [sourceId] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a queued job with a deduplicated source set', async () => {
    const prisma = createPrismaMock();
    prisma.dataSource.findMany.mockResolvedValue([
      {
        id: sourceId,
        enabled: true,
        retired_at: null,
        configuration_reference: 'b2b_tn',
      },
    ]);
    prisma.collectionJob.create.mockResolvedValue({ id: 'job-id' });
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);
    jest.spyOn(service as never, 'runJob').mockResolvedValue(undefined);

    await service.startJob(actorId, {
      sourceIds: [sourceId, sourceId],
      sector: 'Fintech',
    });

    expect(prisma.collectionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requested_by_id: actorId,
          filters: expect.objectContaining({ sector: 'Fintech' }),
          sources: { create: [{ data_source_id: sourceId }] },
        }),
      }),
    );
  });

  it('returns detailed provenance for an existing collection job', async () => {
    const prisma = createPrismaMock();
    const job = { id: 'job-id', evidence: [{ id: 'evidence-id' }] };
    prisma.collectionJob.findUnique.mockResolvedValue(job);
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(service.getJob('job-id')).resolves.toBe(job);
    expect(prisma.collectionJob.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-id' } }),
    );
  });

  it('rejects a missing collection job detail request', async () => {
    const prisma = createPrismaMock();
    prisma.collectionJob.findUnique.mockResolvedValue(null);
    const service = new DataSourcesService(prisma as never, mailStub, aiStub);

    await expect(service.getJob('missing-job')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('persists only actual returned company evidence', async () => {
    const prisma = createPrismaMock();
    const jobId = 'job';
    const companyId = 'company';
    prisma.collectionJob.update.mockResolvedValue({
      id: jobId,
      requested_by_id: actorId,
      filters: { sector: 'IT' },
      sources: [
        { data_source: { id: sourceId, configuration_reference: 'b2b_tn' } },
      ],
    });
    const tx = {
      ...prisma,
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: companyId }),
      },
    };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    const ai = {
      campaign: jest
        .fn()
        .mockResolvedValue({
          pipeline_status: 'COMPLETED',
          offer_recommendations: {
            companies: [
              {
                company_id: 'source-company',
                canonical_name: 'Real Company',
                scoring: { total_score: 65 },
                source_records: [
                  {
                    source_name: 'b2b_tn',
                    source_url: 'https://b2b.tn/company',
                  },
                ],
              },
            ],
          },
        }),
    };
    const service = new DataSourcesService(
      prisma as never,
      mailStub,
      ai as never,
    );
    await (
      Reflect.get(service, 'runJob') as (id: string) => Promise<void>
    ).call(service, jobId);
    expect(prisma.companySourceEvidence.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          company_id: companyId,
          data_source_id: sourceId,
          reference_label: 'https://b2b.tn/company',
        }),
      ],
    });
    expect(prisma.collectionJob.update).toHaveBeenLastCalledWith({
      where: { id: jobId },
      data: expect.objectContaining({ discovered_count: 1, created_count: 1 }),
    });
  });
});
