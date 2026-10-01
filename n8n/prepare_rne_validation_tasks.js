// n8n Code node: Run Once for All Items.
const request = $input.first().json;
const normalization = request.normalization;
const policy = request.official_validation;

if (!normalization || typeof normalization !== 'object' || !Array.isArray(normalization.companies)) {
  throw new Error('RNE validation requires a normalization object with companies');
}
if (!policy || typeof policy !== 'object') throw new Error('RNE validation requires official_validation policy');
if (typeof policy.enabled !== 'boolean') throw new Error('official_validation.enabled must be boolean');
if (!['WHEN_IDENTIFIER_AVAILABLE', 'REQUIRED_BEFORE_READY', 'MANUAL_ONLY'].includes(policy.mode)) {
  throw new Error(`Unsupported official-validation mode: ${policy.mode}`);
}
if (!['CONTINUE_PARTIAL', 'REVIEW', 'BLOCK_READINESS'].includes(policy.failure_policy)) {
  throw new Error(`Unsupported RNE failure policy: ${policy.failure_policy}`);
}
if (normalization.companies.length === 0) throw new Error('RNE validation received no companies');

return normalization.companies.map((company) => ({
  json: {
    campaign_id: normalization.campaign_id,
    company_id: company.company_id,
    canonical_name: company.canonical_name,
    identifier: company.legal_identifier,
    validation_policy: policy,
    company,
    normalization_status: normalization.status,
    normalization_warnings: normalization.warnings ?? [],
  },
}));
