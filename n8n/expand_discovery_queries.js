// n8n Code node: Run Once for All Items.
const plan = $input.first().json;
if (!plan.campaign_id || !Array.isArray(plan.queries) || plan.queries.length === 0) {
  throw new Error('Research plan requires campaign_id and a non-empty queries array');
}
const maximumCandidates = Number(plan.stop_conditions?.maximum_candidates ?? 200);
const supported = new Set(['google_maps', 'b2b_tn', 'web_search', 'openstreetmap', 'user_supplied']);

return plan.queries.map((query) => {
  if (!supported.has(query.source_id)) {
    throw new Error(`Unsupported discovery source: ${query.source_id}`);
  }
  return {
    json: {
      ...query,
      campaign_id: plan.campaign_id,
      maximum_candidates: maximumCandidates,
      limit_per_query: Math.max(1, Math.min(20, maximumCandidates)),
    },
  };
});

