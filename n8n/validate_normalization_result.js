// n8n Code node: Run Once for Each Item.
const result = $json;
for (const field of ['contract_version', 'campaign_id', 'status']) {
  if (typeof result[field] !== 'string' || !result[field]) throw new Error(`Normalization output requires ${field}`);
}
for (const field of ['raw_candidate_count', 'unique_company_count', 'duplicates_merged', 'review_required_count']) {
  if (!Number.isInteger(result[field]) || result[field] < 0) throw new Error(`Normalization output has invalid ${field}`);
}
if (!Array.isArray(result.companies) || !Array.isArray(result.warnings)) {
  throw new Error('Normalization output requires companies and warnings arrays');
}
if (result.raw_candidate_count !== result.unique_company_count + result.duplicates_merged) {
  throw new Error('Normalization counts are inconsistent');
}
const ids = new Set();
for (const company of result.companies) {
  if (typeof company.company_id !== 'string' || !company.company_id.startsWith('cmp_')) throw new Error('Invalid company_id');
  if (ids.has(company.company_id)) throw new Error(`Duplicate company_id: ${company.company_id}`);
  ids.add(company.company_id);
  if (typeof company.canonical_name !== 'string' || !company.canonical_name) throw new Error('Company requires canonical_name');
  if (!Array.isArray(company.source_records) || company.source_records.length === 0) throw new Error('Company requires source evidence');
}
return { json: result };
