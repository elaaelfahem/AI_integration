import { ProspectingService } from './prospecting.service';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
describe('AI prospecting persistence', () => {
  function setup() {
    const prisma = {
      prospectingCriteria: { upsert: jest.fn() },
      prospectingRun: {
        create: jest.fn().mockResolvedValue({ id: 'run' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
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
      resolveCompanyWebsite: jest.fn().mockResolvedValue({ status: 'UNRESOLVED', website: null }),
      collectCompanyWebsite: jest.fn().mockResolvedValue({ status: 'UNAVAILABLE', pages: [], warnings: [] }),
      searchPublicEvidence: jest.fn().mockResolvedValue({ candidates: [] }),
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
    const result = await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 5 });
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
    expect(update.run_id).toBeUndefined();
    expect(update.score_snapshot).toBeUndefined();
    expect(prisma.prospectingEntry.upsert.mock.calls[0][0].create.recommendation).toContain('Revue requise');
  });
  it('stores the campaign sector only when scoring confirms it from trusted evidence', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockResolvedValue({ pipeline_status: 'REVIEW_REQUIRED', offer_recommendations: { companies: [
      { company_id: 'confirmed', canonical_name: 'Confirmed', scoring: {
        total_score: 60, ready_for_offer_recommendation: false,
        reasons: ['Matches a campaign target sector'], missing_data: ['confirmed_target_location'],
      } },
      { company_id: 'unconfirmed', canonical_name: 'Unconfirmed', scoring: {
        total_score: 40, ready_for_offer_recommendation: false,
        reasons: [], missing_data: ['confirmed_target_sector'],
      } },
    ] } });
    await service.start('manager', 'MANAGER', { sector: 'tech', governorate: 'Sousse', targetCompanies: 5 });
    expect(prisma.company.upsert.mock.calls.map(([call]) => call.create.sector)).toEqual(['tech', undefined]);
  });
  it('collects official contacts after resolving a missing website and saves their sources', async () => {
    const { service, prisma, ai } = setup();
    ai.resolveCompanyWebsite.mockResolvedValue({ status: 'RESOLVED', website: 'https://acme.tn/', evidence: [] });
    ai.collectCompanyWebsite.mockResolvedValue({ status: 'COLLECTED', warnings: [], pages: [{
      source_url: 'https://acme.tn/contact', retrieved_at: 'now', checksum: 'contact', http_status: 200,
      text: 'Contact: info@acme.tn', evidence_links: [{ type: 'phone', value: '+216 36 360 000' }],
    }] });
    ai.searchPublicEvidence.mockResolvedValue({ candidates: [{
      source_url: 'https://www.linkedin.com/company/acme-tn', retrieved_at: 'now', checksum: 'linkedin',
      payload: { title: 'ACME - LinkedIn', content: 'Website: https://acme.tn/. Company size: 51-200 employees' },
    }] });
    await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 5 });
    const company = prisma.company.upsert.mock.calls[0][0].create;
    expect(company.phone).toBe('+216 36 360 000');
    expect(company.email).toBe('info@acme.tn');
    expect(company.ai_context).toMatchObject({
      website: 'https://acme.tn/', employee_range: '51-200',
      contact_evidence: [
        expect.objectContaining({ field: 'phone', source_url: 'https://acme.tn/contact' }),
        expect.objectContaining({ field: 'email', source_url: 'https://acme.tn/contact' }),
      ],
    });
  });

  it('reuses sourced company contacts for a Maps-matched brand branch', async () => {
    const { service, prisma, ai } = setup();
    prisma.company.findMany.mockResolvedValue([{
      ai_source_id: 'old-source', name: 'MYTEK', ai_context: {
        website: 'https://mytek.tn/',
        employee_range: '201-500', employee_size_evidence: { source_url: 'https://linkedin.com/company/mytek' },
        contact_evidence: [{ field: 'phone', value: '+216 36 360 000', source_name: 'official_website', source_url: 'https://mytek.tn/contact' }],
      },
    }]);
    ai.campaign.mockResolvedValue({ pipeline_status: 'COMPLETED', offer_recommendations: { companies: [{
      company_id: 'new-source', canonical_name: 'Mytek Tunis', scoring: { total_score: 60, ready_for_offer_recommendation: false },
    }] } });
    ai.resolveCompanyWebsite.mockResolvedValue({ status: 'RESOLVED', website: 'https://mytek.tn/', evidence: [], method: 'BRAND_BRANCH_MATCH' });
    await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 5 });
    const context = prisma.company.upsert.mock.calls[0][0].create.ai_context;
    expect(context.phones).toContain('+216 36 360 000');
    expect(context.employee_range).toBe('201-500');
    expect(context.contact_evidence).toEqual([expect.objectContaining({ source_name: 'official_website', source_url: 'https://mytek.tn/contact' })]);
    expect(context.brand_profile_reuse.method).toBe('SAME_BRAND_AND_DOMAIN');
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
    const result = await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 5 });
    expect(ai.campaign).toHaveBeenCalledWith('run', expect.anything(), undefined, {
      source_urls: ['https://b2b.tn/entreprise/acme/'],
      names: ['ACME'],
      domains: ['acme.tn'],
    }, undefined);
    expect(result).toMatchObject({ discoveredCount: 0, status: 'COMPLETED' });
    expect(prisma.company.upsert).not.toHaveBeenCalled();
    expect(prisma.prospectingEntry.upsert).not.toHaveBeenCalled();
  });
  it('records a failed run and imports nothing when AI fails', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockRejectedValue(new Error('offline'));
    await expect(service.start('manager', 'MANAGER', { targetCompanies: 5 })).rejects.toThrow(
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
  it('continues beyond raw target while bounding candidates when none qualify', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockImplementation(async (id: string) => ({
      pipeline_status: 'REVIEW_REQUIRED',
      offer_recommendations: { companies: Array.from({ length: 10 }, (_, index) => ({
        company_id: `${id}-${index}`, canonical_name: `Company ${id}-${index}`,
        scoring: { total_score: 80, ready_for_offer_recommendation: false },
      })) },
    }));
    const started = await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 12 });
    expect(started).toMatchObject({ status: 'RUNNING', discoveredCount: 0 });
    for (let attempt = 0; attempt < 30 && !prisma.prospectingRun.update.mock.calls.some(
      ([arg]) => arg.data.status === 'COMPLETED' && arg.data.completed_at,
    ); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(ai.campaign).toHaveBeenCalledTimes(4);
    expect(ai.campaign.mock.calls.map(call => call[5])).toEqual([1, 2, 3, 4]);
    expect(prisma.company.upsert).toHaveBeenCalledTimes(36);
    expect(prisma.prospectingRun.update.mock.calls.at(-1)?.[0].data.criteria.progress).toEqual({ completed: 0, total: 12 });
    expect(prisma.prospectingRun.update.mock.calls.at(-1)?.[0].data.criteria.target_met).toBe(false);
  });
  it('keeps saved companies and reports an unmet target when search becomes unavailable', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockImplementation(async (id: string) => {
      if (id.endsWith('-page-2')) throw new ServiceUnavailableException('Search cooling down');
      return { pipeline_status: 'PARTIAL', offer_recommendations: { companies: [{
        company_id: 'one-sourced-company', canonical_name: 'One sourced company',
        scoring: { total_score: 60, ready_for_offer_recommendation: false },
      }] } };
    });
    await service.start('manager', 'MANAGER', { sector: 'IT', targetCompanies: 10 });
    for (let attempt = 0; attempt < 30 && !prisma.prospectingRun.update.mock.calls.some(
      ([arg]) => arg.data.criteria?.stage === 'COMPLETED_PARTIAL',
    ); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    const final = prisma.prospectingRun.update.mock.calls.find(([arg]) => arg.data.criteria?.stage === 'COMPLETED_PARTIAL')?.[0];
    expect(final?.data.status).toBe('COMPLETED');
    expect(final?.data.criteria).toMatchObject({target_met:false,pipeline_status:'SOURCES_UNAVAILABLE',progress:{completed:1,total:10}});
    expect(prisma.company.upsert).toHaveBeenCalledTimes(1);
  });
  it('processes all supplied companies even when the requested target is smaller', async () => {
    const { service, prisma, ai } = setup();
    ai.campaign.mockImplementation(async (id: string) => ({
      pipeline_status: 'REVIEW_REQUIRED', offer_recommendations: { companies: [{
        company_id: id, canonical_name: id,
        scoring: { total_score: 40, ready_for_offer_recommendation: false },
      }] },
    }));
    const suppliedCompanies = Array.from({ length: 6 }, (_, index) => ({ name: `Company ${index}` }));
    const started = await service.start('manager', 'MANAGER', { targetCompanies: 5, suppliedCompanies });
    expect(started.status).toBe('RUNNING');
    for (let attempt = 0; attempt < 30 && !prisma.prospectingRun.update.mock.calls.some(
      ([arg]) => arg.data.status === 'COMPLETED' && arg.data.completed_at,
    ); attempt++)
      await new Promise(resolve => setTimeout(resolve, 5));
    expect(ai.campaign.mock.calls.map(call => call[4]?.length)).toEqual([5, 1]);
    expect(prisma.prospectingRun.update.mock.calls.at(-1)?.[0].data.criteria.targetCompanies).toBe(5);
  });
  it('refreshes supplied identities using the same upsert and saves a run snapshot without moving historical entries', async () => {
    const { service, prisma, ai } = setup();
    prisma.company.findMany.mockResolvedValue([{ai_source_id:'source-id',name:'ACME',ai_context:{domains:['acme.tn']}}]);
    await service.start('manager','MANAGER',{targetCompanies:1,suppliedCompanies:[{name:'ACME',website:'https://acme.tn'}]});
    expect(ai.campaign.mock.calls[0][3]).toEqual({source_urls:[],names:[],domains:[]});
    expect(prisma.company.upsert.mock.calls[0][0].where.created_by_id_ai_source_id.ai_source_id).toBe('source-id');
    expect(prisma.prospectingEntry.upsert.mock.calls[0][0].update.run_id).toBeUndefined();
    const saved = prisma.prospectingRun.update.mock.calls.at(-1)?.[0].data.criteria;
    expect(saved.result_snapshots).toHaveLength(1);
    expect(saved.result_snapshots[0].scoring.ready_for_offer_recommendation).toBe(false);
    expect(saved.score_version).toBe('lead-score-2.1');
  });

});
