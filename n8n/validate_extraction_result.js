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
  if (fact.inferred !== false || typeof fact.extractor_confidence !== 'number' || !Number.isFinite(fact.extractor_confidence) || fact.extractor_confidence < 0 || fact.extractor_confidence > 1) throw new Error('Invalid fact provenance or confidence');
  if (!fact.value_text.trim() || typeof fact.evidence_text !== 'string' || !fact.evidence_text.trim() || typeof fact.retrieved_at !== 'string' || !Number.isFinite(Date.parse(fact.retrieved_at)) || typeof fact.uncertainty !== 'string' || !fact.uncertainty.trim()) throw new Error('Missing fact evidence or timestamp');
  const page = (expected.collection?.pages ?? []).find(page => page.source_url === fact.source_url && page.retrieved_at === fact.retrieved_at);
  const quoted = page && (String(page.text ?? '').includes(fact.evidence_text)
    || (page.evidence_links ?? []).some(link => link.value === fact.evidence_text));
  if (!quoted) throw new Error('Fact quote is absent from the retrieved source page');
  // n8n's restricted Code runtime does not expose the URL global. Accept only
  // absolute HTTP(S) DNS-host URLs without credentials or ambiguous separators.
  const source = fact.source_url.match(/^https?:\/\/([^/?#]+)(?:[/?#][^\s\\]*)?$/i);
  const authority = source?.[1].match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i);
  if (!authority || authority[1].split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) || (authority[2] && (Number(authority[2]) < 1 || Number(authority[2]) > 65535)) || /[\s\\\u0000-\u001f\u007f]/.test(fact.source_url)) throw new Error('Invalid fact source URL');
}
return { json: result };
