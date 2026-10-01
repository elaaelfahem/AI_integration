// n8n Code node: Run Once for All Items.
const responses = $input.all().map((item) => item.json);
const tasks = $('Prepare RNE Validation Tasks').all().map((item) => item.json);
if (responses.length !== tasks.length) throw new Error('RNE response count does not match company count');

const taskByCompany = new Map(tasks.map((task) => [task.company_id, task]));
const responseByCompany = new Map(responses.map((response) => [response.company_id, response]));
const policy = tasks[0].validation_policy;
const reviewItems = [];

function shouldReview(status) {
  if (status === 'CONFLICT') return true;
  if (policy.mode === 'MANUAL_ONLY' && status === 'NOT_REQUESTED') return true;
  return policy.failure_policy === 'REVIEW' && ['NOT_FOUND', 'UNAVAILABLE'].includes(status);
}

function readyForScoring(status) {
  if (status === 'VERIFIED') return true;
  if (status === 'CONFLICT') return false;
  if (policy.mode === 'REQUIRED_BEFORE_READY') return false;
  if (policy.failure_policy === 'BLOCK_READINESS' && !['SKIPPED_NO_IDENTIFIER', 'NOT_REQUESTED'].includes(status)) return false;
  return true;
}

const companies = tasks.map((task) => {
  const validation = responseByCompany.get(task.company_id);
  if (!validation) throw new Error(`Missing RNE response for ${task.company_id}`);
  const reviewRequired = shouldReview(validation.status);
  const ready = readyForScoring(validation.status);
  if (reviewRequired) {
    reviewItems.push({
      review_item_id: `rne_review_${task.company_id}`,
      company_id: task.company_id,
      type: policy.mode === 'MANUAL_ONLY' ? 'MANUAL_RNE_VALIDATION' : `RNE_${validation.status}`,
      priority: validation.status === 'CONFLICT' ? 'HIGH' : 'NORMAL',
      status: 'OPEN',
      conflicts: validation.conflicts,
    });
  }
  return {
    ...task.company,
    official_validation: validation,
    ready_for_scoring: ready,
    review_required: Boolean(task.company.review_required || reviewRequired),
  };
});

const counts = Object.fromEntries([
  'NOT_REQUESTED', 'SKIPPED_NO_IDENTIFIER', 'VERIFIED', 'NOT_FOUND', 'CONFLICT', 'UNAVAILABLE',
].map((status) => [status.toLocaleLowerCase(), responses.filter((response) => response.status === status).length]));
const blockedCount = companies.filter((company) => !company.ready_for_scoring).length;
let status = 'COMPLETED';
if (reviewItems.length) status = 'REVIEW_REQUIRED';
else if (blockedCount) status = 'PARTIAL';

const warnings = [...new Set([
  ...(tasks[0].normalization_warnings ?? []),
  ...responses.flatMap((response) => response.warnings ?? []),
])];

return [{
  json: {
    contract_version: '1.0',
    campaign_id: tasks[0].campaign_id,
    status,
    provider: 'RNE',
    policy,
    company_count: companies.length,
    counts,
    ready_for_scoring_count: companies.length - blockedCount,
    blocked_from_scoring_count: blockedCount,
    review_required_count: reviewItems.length,
    companies,
    review_items: reviewItems,
    warnings,
  },
}];
