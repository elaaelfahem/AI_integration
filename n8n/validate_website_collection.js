// n8n Code node: Run Once for Each Item.
const expected = $('Build Website Collector Request').item.json;
const result = $json;
const statuses = new Set(['COLLECTED', 'SKIPPED_NO_WEBSITE', 'BLOCKED_UNSAFE_URL', 'UNAVAILABLE']);
if (result.campaign_id !== expected.campaign_id || result.company_id !== expected.company_id) throw new Error('Website collector changed a controlled identifier');
if (!statuses.has(result.status) || !Array.isArray(result.pages) || !Array.isArray(result.warnings)) throw new Error('Invalid website collection envelope');
for (const page of result.pages) {
  for (const field of ['source_url', 'text', 'retrieved_at', 'checksum']) {
    if (typeof page[field] !== 'string' || !page[field]) throw new Error(`Website page requires ${field}`);
  }
}
return { json: result };
