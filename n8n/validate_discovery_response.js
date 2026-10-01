// n8n Code node: Run Once for Each Item.
const expected = $('Expand Discovery Queries').item.json;
const value = $json;

for (const field of ['campaign_id', 'query_id', 'source_id', 'status']) {
  if (typeof value[field] !== 'string' || !value[field]) {
    throw new Error(`Invalid discovery response: ${field}`);
  }
}
for (const field of ['campaign_id', 'query_id', 'source_id']) {
  if (value[field] !== expected[field]) {
    throw new Error(`Discovery connector changed controlled field: ${field}`);
  }
}
if (!['COMPLETED', 'SKIPPED'].includes(value.status)) {
  throw new Error(`Invalid discovery status: ${value.status}`);
}
if (!Array.isArray(value.candidates) || !Array.isArray(value.warnings)) {
  throw new Error('Discovery response requires candidates and warnings arrays');
}
for (const candidate of value.candidates) {
  for (const field of [
    'source_record_id', 'campaign_id', 'query_id', 'source_name',
    'source_type', 'source_url', 'retrieved_at', 'checksum',
  ]) {
    if (typeof candidate[field] !== 'string' || !candidate[field]) {
      throw new Error(`Invalid raw-source envelope field: ${field}`);
    }
  }
  if (!candidate.payload || typeof candidate.payload !== 'object') {
    throw new Error('Raw-source envelope payload must be an object');
  }
}

return { json: value };

