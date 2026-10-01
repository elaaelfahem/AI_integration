// n8n Code node: Run Once for Each Item.
const result = $json;
if (result.contract_version !== '1.0' || typeof result.campaign_id !== 'string') throw new Error('Invalid RNE validation contract');
if (!['COMPLETED', 'PARTIAL', 'REVIEW_REQUIRED'].includes(result.status)) throw new Error(`Invalid aggregate RNE status: ${result.status}`);
if (!Array.isArray(result.companies) || !Array.isArray(result.review_items) || !Array.isArray(result.warnings)) {
  throw new Error('RNE validation result requires companies, review_items, and warnings');
}
if (result.company_count !== result.companies.length) throw new Error('RNE company count is inconsistent');
if (result.ready_for_scoring_count + result.blocked_from_scoring_count !== result.company_count) {
  throw new Error('RNE readiness counts are inconsistent');
}
for (const company of result.companies) {
  if (!company.official_validation || company.official_validation.provider !== 'RNE') throw new Error('Company is missing RNE validation envelope');
  if (typeof company.ready_for_scoring !== 'boolean') throw new Error('Company is missing readiness decision');
}
return { json: result };
