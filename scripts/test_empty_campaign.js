const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = JSON.parse(fs.readFileSync('n8n/dme_campaign_orchestrator.workflow.json'));
const node = workflow.nodes.find(n => n.name === 'Build Empty Campaign Result');
assert.equal(workflow.connections['Call Candidate Normalizer'].main[0][0].node, 'Has Companies');
assert.equal(workflow.connections['Has Companies'].main[1][0].node, node.name);
for (const status of ['COMPLETED', 'PARTIAL', 'SKIPPED']) {
  const select = name => ({item: {json: name === 'Call Discovery Executor'
    ? {campaign_id:'empty-test',status,queries_completed:status==='SKIPPED'?0:1}
    : {campaign_id:'empty-test'}}});
  const result = new Function('$json', '$', node.parameters.jsCode)(
    {campaign_id:'empty-test',companies:[],status:'COMPLETED'}, select).json;
  assert.equal(result.pipeline_status, status==='COMPLETED'?'NO_COMPANIES':'SOURCES_UNAVAILABLE');
  assert.deepEqual(result.offer_recommendations.companies, []);
  assert.equal(result.stages.official_validation, 'SKIPPED');
}
console.log('PASS: empty searches and source failures terminate before RNE');
