// An empty search is a valid result; unavailable sources are a separate outcome.
const normalization = $json;
const discovery = $('Call Discovery Executor').item.json;
const plan = $('Validate Research Plan').item.json;
if (!Array.isArray(normalization.companies) || normalization.companies.length !== 0
    || normalization.campaign_id !== plan.campaign_id || discovery.campaign_id !== plan.campaign_id) {
  throw new Error('Invalid empty campaign envelope');
}
const unavailable = discovery.status === 'SKIPPED' || discovery.status === 'PARTIAL';
return { json: {
  contract_version: '1.0', campaign_id: plan.campaign_id,
  pipeline_status: unavailable ? 'SOURCES_UNAVAILABLE' : 'NO_COMPANIES',
  stages: { research_planning: 'COMPLETED', discovery: discovery.status,
    normalization: normalization.status, official_validation_initial: 'SKIPPED',
    website_enrichment: 'SKIPPED', official_validation: 'SKIPPED',
    lead_scoring: 'SKIPPED', offer_recommendation: 'SKIPPED' },
  research_plan: plan, discovery, normalization,
  offer_recommendations: { campaign_id: plan.campaign_id, company_count: 0, companies: [] },
} };
