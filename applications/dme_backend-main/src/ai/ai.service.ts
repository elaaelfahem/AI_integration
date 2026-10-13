import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

export type AiCompany = {
  company_id: string;
  canonical_name: string;
  sector?: string;
  governorate?: string;
  address?: string;
  phones?: string[];
  emails?: string[];
  scoring: {
    total_score: number;
    category: string;
    ready_for_offer_recommendation: boolean;
  };
  offer_recommendation?: {
    recommendations?: { offer_name: string }[];
    warnings?: string[];
  };
  source_records?: { source_name: string; source_url?: string }[];
  [key: string]: unknown;
};
export type CampaignResult = {
  campaign_id: string;
  pipeline_status: string;
  offer_recommendations: { companies: AiCompany[] };
};

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async call<T>(
    key: string,
    path: string,
    body: unknown,
    timeout = 90000,
  ): Promise<T> {
    const base = this.config.get<string>(key);
    if (!base)
      throw new ServiceUnavailableException('AI service is not configured');
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.get<string>('AI_SERVICE_TOKEN')
            ? {
                authorization: `Bearer ${this.config.get<string>('AI_SERVICE_TOKEN')}`,
              }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error('Upstream error');
      const result: unknown = await response.json();
      return (
        Array.isArray(result) && result.length === 1 ? result[0] : result
      ) as T;
    } catch {
      throw new BadGatewayException(
        'AI service unavailable or timed out. Please try again.',
      );
    }
  }

  async campaign(
    id: string,
    criteria: {
      sector: string | null;
      governorate: string | null;
      employee_range: string | null;
      query: string | null;
    },
    sources = ['b2b_tn', 'web_search'],
    known: { source_urls: string[]; names: string[]; domains: string[] } = {
      source_urls: [],
      names: [],
      domains: [],
    },
  ) {
    // Tell discovery which companies the caller already holds so this search
    // returns new ones. Without it the search still runs and the caller drops
    // the repeats.
    if (
      this.config.get<string>('AI_DISCOVERY_URL') &&
      known.source_urls.length + known.names.length + known.domains.length
    ) {
      await this.call('AI_DISCOVERY_URL', '/v1/exclusions', {
        campaign_id: id,
        ...known,
      }).catch(() => undefined);
    }
    const sector = ({ tech: 'informatique', industry: 'industrie', health: 'santé' } as Record<string, string>)[criteria.sector ?? ''] ?? criteria.sector;
    const range = criteria.employee_range?.match(/^(\d+)(?:-(\d+)|\+)$/);
    const result = await this.call<CampaignResult>(
      'AI_N8N_URL',
      '/webhook/dme/campaign-run',
      {
        campaign_id: id,
        campaign_name: `Application campaign ${id}`,
        countries: ['TN'],
        sectors: [sector || criteria.query || 'entreprises'],
        governorates: criteria.governorate ? [criteria.governorate] : [],
        cities: [],
        keywords: criteria.query ? [criteria.query] : [],
        excluded_keywords: [],
        employee_range: {
          minimum: range ? Number(range[1]) : null,
          maximum: range?.[2] ? Number(range[2]) : null,
        },
        maximum_candidates: 10,
        maximum_enrichment_companies: 10,
        enable_semantic_extraction: false,
        enable_semantic_offer_explanation: false,
        enabled_sources: sources.map((source_id) => ({
          source_id,
          source_type:
            source_id === 'b2b_tn'
              ? 'directory'
              : source_id === 'google_maps'
                ? 'maps'
                : 'web_search',
          capabilities: [
            'keyword',
            'sector',
            'location',
            'company_lookup',
            'pagination',
          ],
          supported_languages: ['fr'],
        })),
        official_validation: {
          enabled: true,
          source_id: 'rne_kyc',
          mode: 'WHEN_IDENTIFIER_AVAILABLE',
          failure_policy: 'REVIEW',
          enrich: true,
        },
        language_preferences: ['fr'],
        limits: {
          maximum_queries: sources.length,
          maximum_queries_per_source: 1,
        },
      },
      300000,
    );
    if (result?.campaign_id === id && result.pipeline_status === 'SOURCES_UNAVAILABLE') {
      throw new ServiceUnavailableException('Discovery sources are temporarily unavailable. Please try again later.');
    }
    if (
      !result ||
      result.campaign_id !== id ||
      !['COMPLETED', 'PARTIAL', 'REVIEW_REQUIRED', 'NO_COMPANIES'].includes(
        result.pipeline_status,
      ) ||
      !Array.isArray(result.offer_recommendations?.companies)
    ) {
      throw new BadGatewayException('AI campaign did not return valid results');
    }
    for (const company of result.offer_recommendations.companies) {
      if (
        !company.company_id ||
        typeof company.canonical_name !== 'string' ||
        !company.canonical_name.trim() ||
        !Number.isInteger(company.scoring?.total_score) ||
        company.scoring.total_score < 0 ||
        company.scoring.total_score > 100
      ) {
        throw new BadGatewayException(
          'AI campaign returned an invalid company',
        );
      }
    }
    return result;
  }

  async checkInput(text: string) {
    const risk = await this.call<{ disposition: string }>(
      'AI_RISK_URL',
      '/v1/detect',
      {
        event_id: randomUUID(),
        event_type: 'AI_INPUT',
        enable_ai: false,
        payload: { message: text },
      },
      10000,
    );
    if (
      !risk ||
      !['ALLOW', 'ALLOW_WITH_WARNING', 'REVIEW', 'BLOCK_AND_REVIEW'].includes(
        risk.disposition,
      )
    )
      throw new BadGatewayException('Invalid risk response');
    if (risk.disposition === 'BLOCK_AND_REVIEW')
      throw new BadRequestException(
        'This text requires review before AI processing. Remove credentials or instructions that override the assistant.',
      );
  }

  get modelEnabled() {
    return this.config.get<string>('AI_ENABLE_MODEL') === 'true';
  }
}
