#!/usr/bin/env node
const fs = require('fs');
const workflow = JSON.parse(fs.readFileSync('n8n/dme_company_scoring.workflow.json', 'utf8'));
const source = workflow.nodes.find((node) => node.name === 'Score Companies').parameters.jsCode;
const run = (request) => new Function('$input', source)({ first: () => ({ json: request }) })[0].json;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const request = {
  campaign: { campaign_id: 'campaign-test', sectors: ['software'], locations: ['Tunis'] },
  official_validation: { campaign_id: 'campaign-test', companies: [
    { company_id: 'strong', canonical_name: 'Strong Software', sector: 'software', address: 'Tunis', description: 'Cloud software company hiring', website: 'https://strong.tn', phones: ['+21670000000'], emails: ['sales@strong.tn'], social_profiles: ['https://linkedin.com/company/strong'], employee_count: 70, legal_identifier: '123', source_ids: ['b2b_tn','google_maps'], source_records: [{source_record_id:'s1'}], enriched_facts: [{field:'email',value_text:'sales@strong.tn',evidence_ref:'page:1'}], profile_completeness: 0.9, ready_for_scoring: true, official_validation: {status:'VERIFIED'} },
    { company_id: 'thin', canonical_name: 'Thin Company', source_ids: ['web_search'], source_records: [{source_record_id:'s2'}], ready_for_scoring: true, official_validation: {status:'SKIPPED_NO_IDENTIFIER'} },
    { company_id: 'nested-sector', canonical_name: 'Nested Sector Company', address: 'Tunis', phones: ['+21671111111'], source_ids: ['b2b_tn'], source_records: [{source_record_id:'s4', payload:{categories:['DÉVELOPPEMENT DE LOGICIELS']}}], profile_completeness: 0.3, ready_for_scoring: true, official_validation: {status:'SKIPPED_NO_IDENTIFIER'} },
    { company_id: 'conflict', canonical_name: 'Conflict Software', sector: 'software', address: 'Tunis', website: 'https://conflict.tn', phones: ['+21671000000'], emails: ['hello@conflict.tn'], source_ids: ['b2b_tn','google_maps'], source_records: [{source_record_id:'s3'}], profile_completeness: 0.8, ready_for_scoring: false, official_validation: {status:'CONFLICT'} },
  ]},
};
const first = run(request); const second = run(request);
const byId = Object.fromEntries(first.companies.map((company) => [company.company_id, company]));
assert(byId.strong.scoring.category === 'A', 'Strong company should be A');
assert(byId.thin.scoring.category === 'C', 'Thin company should be C');
assert(byId['nested-sector'].scoring.components.campaign_fit >= 20, 'Sector evidence nested in source records must count');
assert(byId.conflict.scoring.category === 'REVIEW', 'RNE conflict must be REVIEW');
assert(!byId.conflict.scoring.ready_for_offer_recommendation, 'Conflict must not reach offers');
assert(JSON.stringify(first) === JSON.stringify(second), 'Scores must be deterministic');
const french = run({ campaign: { campaign_id: 'campaign-fr', sectors: ['santé'], locations: ['Tunis'] }, official_validation: { campaign_id: 'campaign-fr', companies: [
  { company_id: 'medical', canonical_name: 'Sonomed', address: 'Tunis', phones: ['+21671948120'], source_ids: ['b2b_tn'], source_records: [{source_record_id:'s5', payload:{categories:["FABRICATION DE MATÉRIELS ET APPAREILS MÉDICAUX"]}}], ready_for_scoring: true, official_validation: {status:'SKIPPED_NO_IDENTIFIER'} },
  { company_id: 'unrelated', canonical_name: 'Transport Express', address: 'Tunis', phones: ['+21671000001'], source_ids: ['b2b_tn'], source_records: [{source_record_id:'s6', payload:{categories:['TRANSPORT ROUTIER']}}], ready_for_scoring: true, official_validation: {status:'SKIPPED_NO_IDENTIFIER'} },
]}});
const frenchById = Object.fromEntries(french.companies.map((company) => [company.company_id, company]));
assert(frenchById.medical.scoring.reasons.includes('Matches a campaign target sector'), 'Accented French sector must match directory categories found by discovery');
assert(frenchById.unrelated.scoring.missing_data.includes('confirmed_target_sector'), 'Unrelated activity must not match the sector');
console.log(JSON.stringify({status:first.status,categories:first.categories,scores:Object.fromEntries(first.companies.map((c)=>[c.company_id,c.scoring.total_score]))}, null, 2));
