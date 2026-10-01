// n8n Code node: Run Once for Each Item.
const result = $json;
if (result.contract_version !== '1.0' || typeof result.campaign_id !== 'string') throw new Error('Invalid website-enrichment contract');
if (!['COMPLETED', 'PARTIAL'].includes(result.status) || !Array.isArray(result.companies) || !Array.isArray(result.warnings)) throw new Error('Invalid website-enrichment result');
if (result.company_count !== result.companies.length) throw new Error('Website-enrichment company count is inconsistent');
for (const company of result.companies) {
  if (!company.website_enrichment || typeof company.profile_completeness !== 'number') throw new Error('Company is missing website enrichment metadata');
}
return { json: result };
