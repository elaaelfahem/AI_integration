// n8n Code node: Run Once for All Items.
const responses = $input.all().map((item) => item.json);
const firstTask = $('Expand Discovery Queries').all()[0].json;
const maximumCandidates = firstTask.maximum_candidates;
const allCandidates = responses.flatMap((response) => response.candidates);
const rawCandidates = allCandidates.slice(0, maximumCandidates);
const warnings = responses.flatMap((response) => response.warnings);
if (allCandidates.length > maximumCandidates) {
  warnings.push(`Candidate limit applied: ${allCandidates.length} reduced to ${maximumCandidates}`);
}
const completed = responses.filter((response) => response.status === 'COMPLETED').length;
const skipped = responses.filter((response) => response.status === 'SKIPPED').length;

return [{
  json: {
    contract_version: '1.0',
    campaign_id: firstTask.campaign_id,
    status: skipped === 0 ? 'COMPLETED' : (completed > 0 ? 'PARTIAL' : 'SKIPPED'),
    queries_attempted: responses.length,
    queries_completed: completed,
    queries_skipped: skipped,
    raw_candidate_count: rawCandidates.length,
    raw_candidates: rawCandidates,
    warnings,
  },
}];

