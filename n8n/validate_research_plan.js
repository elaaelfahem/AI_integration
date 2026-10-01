// n8n Code node: Run Once for Each Item.
let plan = $json;
if (Array.isArray(plan) && plan.length === 1) plan = plan[0];

if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
  throw new Error('Research Planner returned an invalid response envelope');
}
if (plan.contract_version !== '1.0' || typeof plan.campaign_id !== 'string') {
  throw new Error('Research plan has an invalid contract or campaign ID');
}
if (!Array.isArray(plan.queries) || plan.queries.length === 0) {
  throw new Error('Research plan contains no queries');
}
if (plan.query_count !== plan.queries.length) {
  throw new Error('Research plan query_count does not match queries length');
}
if (!plan.stop_conditions || !Number.isInteger(plan.stop_conditions.maximum_candidates)) {
  throw new Error('Research plan has invalid stop conditions');
}

return { json: plan };

