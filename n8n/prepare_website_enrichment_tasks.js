// n8n Code node: Run Once for All Items.
const request = $input.first().json;
const source = request.official_validation ?? request;
if (!source || typeof source !== 'object' || !Array.isArray(source.companies)) {
  throw new Error('Website enrichment requires a company collection');
}
if (typeof source.campaign_id !== 'string' || !source.campaign_id) throw new Error('Website enrichment requires campaign_id');
const limit = Math.max(1, Math.min(Number(request.maximum_enrichment_companies ?? source.companies.length), 200));
const companies = source.companies.slice(0, limit);
const unprocessedCompanies = source.companies.slice(limit);
if (!companies.length) throw new Error('Website enrichment received no companies');

return companies.map((company, index) => ({
  json: {
    campaign_id: source.campaign_id,
    company,
    website: company.website,
    enable_semantic_extraction: request.enable_semantic_extraction === true,
    source_company_count: source.companies.length,
    source_status: source.status,
    source_warnings: source.warnings ?? [],
    unprocessed_companies: index === 0 ? unprocessedCompanies : [],
  },
}));
