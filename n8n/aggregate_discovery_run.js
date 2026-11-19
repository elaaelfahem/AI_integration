// n8n Code node: Run Once for All Items.
const responses = $input.all().map((item) => item.json);
const firstTask = $('Expand Discovery Queries').all()[0].json;
const maximumCandidates = firstTask.maximum_candidates;
const allCandidates = responses.flatMap((response) => response.candidates);
const excluded = [];
const seen = new Set();
const eligible = allCandidates.filter(candidate => {
  const raw = candidate.source_url ?? '';
  const host = raw.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.toLowerCase().replace(/^www\./, '');
  const blocked = ['ween.tn','expat.com','b2b.tn','linkedin.com','facebook.com','instagram.com','scribd.com','wikipedia.org','youtube.com','kompass.com','goafricaonline.com','keejob.com','tanitjobs.com'];
  if (candidate.source_name === 'web_search' && (!host || blocked.some(domain => host === domain || host.endsWith('.' + domain)))) {
    excluded.push({source_url:raw, reason:'DIRECTORY_OR_PLATFORM'}); return false;
  }
  const key = candidate.source_name === 'web_search' ? host : candidate.source_record_id;
  if (seen.has(key)) { excluded.push({source_url:raw,reason:'DUPLICATE_SOURCE'}); return false; }
  seen.add(key); return true;
});
const rawCandidates = eligible.slice(0, maximumCandidates);
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
    received_candidate_count: allCandidates.length,
    excluded_candidates: excluded,
    raw_candidate_count: rawCandidates.length,
    raw_candidates: rawCandidates,
    warnings,
  },
}];

