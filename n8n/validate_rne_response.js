// n8n Code node: Run Once for Each Item.
const expected = $('Build RNE Connector Request').item.json;
const result = $json;
const statuses = new Set([
  'NOT_REQUESTED', 'SKIPPED_NO_IDENTIFIER', 'VERIFIED',
  'NOT_FOUND', 'CONFLICT', 'UNAVAILABLE',
]);
for (const field of ['campaign_id', 'company_id', 'provider', 'status']) {
  if (typeof result[field] !== 'string' || !result[field]) throw new Error(`RNE response requires ${field}`);
}
if (result.campaign_id !== expected.campaign_id || result.company_id !== expected.company_id) {
  throw new Error('RNE connector changed a controlled identifier');
}
if (result.provider !== 'RNE' || !statuses.has(result.status)) {
  throw new Error(`Invalid RNE provider or status: ${result.status}`);
}
if (!Array.isArray(result.conflicts) || !Array.isArray(result.warnings)) {
  throw new Error('RNE response requires conflicts and warnings arrays');
}
if (result.status === 'VERIFIED' && (!result.official_fields || !result.validated_at)) {
  throw new Error('VERIFIED RNE response requires official fields and validation timestamp');
}
return { json: result };
