import { ProspectingService } from './prospecting.service';
import { ForbiddenException } from '@nestjs/common';
describe('AI prospecting persistence', () => {
  function setup() {
    const prisma = {
      prospectingCriteria: { upsert: jest.fn() },
      prospectingRun: {
        create: jest.fn().mockResolvedValue({ id: 'run' }),
        updateMany: jest.fn().mockResolvedValue({count:1}),
        update: jest.fn(),
      },
      company: {
        upsert: jest.fn().mockResolvedValue({ id: 'db-id', ai_score: 80 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      prospectingEntry: {
        findUnique: jest.fn().mockResolvedValue({ status: 'SHORTLISTED' }),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    const ai = {
      campaign: jest
        .fn()
        .mockResolvedValue({
          pipeline_status: 'REVIEW_REQUIRED',
          offer_recommendations: {
            companies: [
              {
                company_id: 'source-id',
                canonical_name: 'ACME',
                scoring: {
                  total_score: 80,
                  ready_for_offer_recommendation: false,
                },
                offer_recommendation: {
                  warnings: ['RNE unavailable'],
                  recommendations: [],
                },
              },
            ],
          },
        }),
    };
    return {
      prisma,
      ai,
      service: new ProspectingService(
        prisma as never,
        {} as never,
        ai as never,
      ),
    };
  }
  it('expires only runs older than the maximum request lease', async () => {
    const { service, prisma } = setup();
    const now = Date.now();
    await service.recoverExpiredRuns();
    const request = prisma.prospectingRun.updateMany.mock.calls[0][0];
    expect(request.where.status).toBe('RUNNING');
    expect(request.where.created_at.lt.getTime()).toBeLessThanOrEqual(now - 600000 + 50);
    expect(request.data.status).toBe('FAILED');
    expect(request.data.completed_at).toBeInstanceOf(Date);
  });
  it('persists real results under manager ownership and retains review gates and shortlist state', async () => {
    const { service, prisma } = setup();
    const result = await service.start('manager', 'MANAGER', { sector: 'IT' });
    expect(result).toMatchObject({
      discoveredCount: 1,
      qualifiedCount: 0,
      pipelineStatus: 'REVIEW_REQUIRED',
    });
    expect(prisma.company.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          manager_id: 'manager',
          created_by_id: 'manager',
          ai_source_id: 'source-id',
        }),
      }),
    );
    const update = prisma.prospectingEntry.upsert.mock.calls[0][0].update;
    expect(update.status).toBeUndefined();
    expect(update.recommendation).toContain('Revue requise');
  });
  it('sends known companies to discovery and adds only new ones to the run', async () => {
    const { service, prisma, ai } = setup();
    prisma.company.findMany.mockResolvedValue([
      {
        ai_source_id: 'source-id',
        name: 'ACME',
        ai_context: {
          source_records: [{ source_url: 'https://b2b.tn/entreprise/acme/' }],
          domains: ['acme.tn'],
        },
      },
    ]);
    const result = await service.start('manager', 'MANAGER', { sector: 'IT' });
    expect(ai.campaign).toHaveBeenCalledWith('run', expect.anything(), undefined, {
      source_urls: ['https://b2b.tn/entreprise/acme/'],
      names: ['ACME'],
      domains: ['acme.tn'],
    });
    expect(result).toMatchObject({ discoveredCount: 0, status: 'COMPLETED' });
    expect(prisma.company.upsert).not.toHaveBeenCalled();
    expect(prisma.prospectingEntry.upsert).not.toHaveBeenCalled();
  });
  it('records a failed run and imports nothing when AI fails', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockRejectedValue(new Error('offline'));
    await expect(service.start('manager', 'MANAGER', {})).rejects.toThrow(
      'offline',
    );
    expect(prisma.company.upsert).not.toHaveBeenCalled();
    expect(prisma.prospectingRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
  it('prevents agents from discovering unassigned companies', async () => {
    const { service, ai } = setup();
    await expect(service.start('agent', 'AGENT', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ai.campaign).not.toHaveBeenCalled();
  });
});
