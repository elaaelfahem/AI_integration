#!/usr/bin/env node
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('n8n/dme_candidate_normalizer.workflow.json', 'utf8'));
const nodeCode = (name) => workflow.nodes.find((node) => node.name === name).parameters.jsCode;
const execute = (input) => new Function('$input', nodeCode('Normalize and Deduplicate'))({ first: () => ({ json: input }) })[0].json;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const example = new Function(nodeCode('Example Discovery Result'))()[0].json;
const merged = execute(example);
assert(merged.raw_candidate_count === 3, 'Expected three raw candidates');
assert(merged.unique_company_count === 2, 'Expected one strong duplicate merge');
assert(merged.duplicates_merged === 1, 'Expected one merged duplicate');
assert(merged.companies.some((company) => company.source_ids.length === 2), 'Expected cross-source evidence');

const ambiguous = JSON.parse(JSON.stringify(example));
ambiguous.raw_candidates = [
  {
    ...ambiguous.raw_candidates[0],
    source_record_id: 'ambiguous-1',
    source_url: 'https://source.example/nova-tunis-1',
    payload: { displayName: { text: 'Nova Tech' }, governorate: 'Tunis' },
  },
  {
    ...ambiguous.raw_candidates[1],
    source_record_id: 'ambiguous-2',
    source_url: 'https://other.example/nova-tunis-2',
    payload: { title: 'NOVA TECH SARL', governorate: 'Tunis' },
  },
];
ambiguous.raw_candidate_count = 2;
const reviewed = execute(ambiguous);
assert(reviewed.unique_company_count === 2, 'Ambiguous names must remain separate');
assert(reviewed.review_required_count === 2, 'Both ambiguous companies must require review');
assert(new Set(reviewed.companies.map((company) => company.company_id)).size === 2, 'Separate companies need separate IDs');

const repeated = execute(example);
assert(JSON.stringify(merged.companies.map((company) => company.company_id)) === JSON.stringify(repeated.companies.map((company) => company.company_id)), 'Company IDs must be deterministic');

console.log(JSON.stringify({
  strong_match: { raw: merged.raw_candidate_count, unique: merged.unique_company_count, merged: merged.duplicates_merged },
  ambiguous_match: { unique: reviewed.unique_company_count, review_required: reviewed.review_required_count },
  deterministic_ids: true,
}, null, 2));
