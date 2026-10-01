// n8n Code node: Run Once for Each Item.
const expected = $('Build Fact Extraction Request').item.json;
const result = $json;
const statuses = new Set([
  'COMPLETED', 'COMPLETED_DETERMINISTIC', 'COMPLETED_FALLBACK',
  'SKIPPED_NO_WEBSITE', 'BLOCKED_UNSAFE_URL', 'UNAVAILABLE',
]);
if (result.campaign_id !== expected.campaign_id || result.company_id !== expected.company.company_id) throw new Error('Fact extraction changed a controlled identifier');
if (!statuses.has(result.status) || !Array.isArray(result.facts) || !Array.isArray(result.warnings)) throw new Error('Invalid fact-extraction envelope');
for (const fact of result.facts) {
  if (typeof fact.field !== 'string' || typeof fact.value_text !== 'string' || typeof fact.source_url !== 'string') throw new Error('Invalid extracted fact');
  if (fact.inferred !== false || Number(fact.extractor_confidence) < 0 || Number(fact.extractor_confidence) > 1) throw new Error('Invalid fact provenance or confidence');
}
return { json: result };
