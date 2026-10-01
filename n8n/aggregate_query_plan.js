// n8n Code node: Run Once for All Items, after Validate Composed Query.
const warnings = [];
const queries = $input.all().map((item) => {
  const query = { ...item.json };
  if (query._composer_warning) warnings.push(query._composer_warning);
  delete query._composer_fallback;
  delete query._composer_warning;
  return query;
});
queries.sort((left, right) => left.query_id.localeCompare(right.query_id));

if (queries.length === 0) {
  throw new Error('Research plan contains no valid queries');
}

const task = $('Prepare Query Tasks').all()[0].json;
const seen = new Set();
for (const query of queries) {
  const key = [
    query.source_id,
    query.language,
    query.query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
  ].join('|');
  if (seen.has(key)) {
    throw new Error(`Duplicate query generated: ${query.query_id}`);
  }
  seen.add(key);
}

return [{
  json: {
    contract_version: '1.0',
    campaign_id: task.campaign_id,
    queries,
    stop_conditions: {
      maximum_queries: task.query_limit,
      maximum_candidates: task.maximum_candidates,
    },
    warnings,
    query_count: queries.length,
  },
}];
