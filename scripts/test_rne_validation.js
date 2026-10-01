#!/usr/bin/env node
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('n8n/dme_rne_validation.workflow.json', 'utf8'));
const code = (name) => workflow.nodes.find((node) => node.name === name).parameters.jsCode;
const runPrepare = (request) => new Function('$input', code('Prepare RNE Validation Tasks'))({ first: () => ({ json: request }) });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function aggregate(tasks, responses) {
  const select = (name) => {
    if (name !== 'Prepare RNE Validation Tasks') throw new Error(`Unexpected node ${name}`);
    return { all: () => tasks };
  };
  return new Function('$input', '$', code('Aggregate RNE Validation'))(
    { all: () => responses.map((json) => ({ json })) },
    select,
  )[0].json;
}

const request = new Function(code('Example RNE Request'))()[0].json;
const tasks = runPrepare(request);
const base = (task, status, warnings = []) => ({
  contract_version: '1.0', campaign_id: task.json.campaign_id, company_id: task.json.company_id,
  provider: 'RNE', status, validated_at: null, identifier_used: task.json.identifier,
  official_fields: null, conflicts: [], retrieval: null, warnings,
});
const responses = tasks.map((task) => task.json.identifier
  ? base(task, 'UNAVAILABLE', ['RNE connector is not configured'])
  : base(task, 'SKIPPED_NO_IDENTIFIER'));
const reviewResult = aggregate(tasks, responses);
assert(reviewResult.company_count === 2, 'Expected two companies');
assert(reviewResult.counts.skipped_no_identifier === 1, 'Expected one missing identifier');
assert(reviewResult.counts.unavailable === 1, 'Expected one unavailable lookup');
assert(reviewResult.review_required_count === 1, 'REVIEW policy must create one review item');

const requiredRequest = JSON.parse(JSON.stringify(request));
requiredRequest.official_validation.mode = 'REQUIRED_BEFORE_READY';
const requiredTasks = runPrepare(requiredRequest);
const requiredResult = aggregate(requiredTasks, responses);
assert(requiredResult.blocked_from_scoring_count === 2, 'Required mode must block both unverified companies');

console.log(JSON.stringify({
  review_policy: { status: reviewResult.status, counts: reviewResult.counts, reviews: reviewResult.review_required_count },
  required_policy: { blocked: requiredResult.blocked_from_scoring_count },
}, null, 2));
