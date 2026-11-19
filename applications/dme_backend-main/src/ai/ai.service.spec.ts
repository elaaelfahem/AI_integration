import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
describe('AI transport', () => {
  const config = new ConfigService({
    AI_N8N_URL: 'http://ai.local',
    AI_RISK_URL: 'http://risk.local',
  });
  afterEach(() => jest.restoreAllMocks());
  it('maps application criteria into a bounded campaign and preserves review status', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            campaign_id: 'run',
            pipeline_status: 'REVIEW_REQUIRED',
            offer_recommendations: { companies: [] },
          }),
        ),
      );
    const result = await new AiService(config).campaign('run', {
      sector: 'IT',
      governorate: 'Tunis',
      query: null,
      employee_range: '50-250',
    });
    expect(result.pipeline_status).toBe('REVIEW_REQUIRED');
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.employee_range).toEqual({ minimum: 50, maximum: 250 });
    expect(body.maximum_candidates).toBe(10);
    expect(body.maximum_enrichment_companies).toBe(10);
    expect(body.search_page).toBe(1);
    expect(
      body.enabled_sources.map((s: { source_id: string }) => s.source_id),
    ).toEqual(['web_search']);
  });
  it.each([
    {
      campaign_id: 'wrong',
      pipeline_status: 'COMPLETED',
      offer_recommendations: { companies: [] },
    },
    {
      campaign_id: 'run',
      pipeline_status: 'SKIPPED',
      offer_recommendations: { companies: [] },
    },
    {
      campaign_id: 'run',
      pipeline_status: 'COMPLETED',
      offer_recommendations: {
        companies: [
          {
            company_id: 'a',
            canonical_name: 'ACME',
            scoring: { total_score: 101 },
          },
        ],
      },
    },
  ])('rejects invalid or skipped campaign envelopes', async (body) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(
      new AiService(config).campaign('run', {
        sector: null,
        governorate: null,
        query: null,
        employee_range: null,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
  it('does not fabricate success when configuration or upstream is missing', async () => {
    await expect(
      new AiService(new ConfigService({})).call('MISSING', '/', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('private upstream detail'));
    await expect(
      new AiService(config).call('AI_N8N_URL', '/', {}),
    ).rejects.toThrow('AI service unavailable');
  });
  it.each(['NO_COMPANIES', 'SOURCES_UNAVAILABLE'])('handles %s without inventing companies', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      campaign_id: 'run', pipeline_status: status, offer_recommendations: { companies: [] },
    })));
    const request = new AiService(config).campaign('run', {
      sector: null, governorate: null, query: null, employee_range: null,
    });
    if (status === 'NO_COMPANIES') await expect(request).resolves.toMatchObject({pipeline_status: status});
    else await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each([['tech','informatique'],['industry','industrie'],['health','santé']])('maps %s to a searchable sector', async (sector, expected) => {
    const fetchMock = jest.spyOn(global,'fetch').mockResolvedValue(new Response(JSON.stringify({campaign_id:'run',pipeline_status:'NO_COMPANIES',offer_recommendations:{companies:[]}})));
    await new AiService(config).campaign('run',{sector,governorate:null,query:null,employee_range:null});
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).sectors).toEqual([expected]);
  });
  it('blocks risky input before model processing', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ disposition: 'BLOCK_AND_REVIEW' })),
      );
    await expect(
      new AiService(config).checkInput('token=secret'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
