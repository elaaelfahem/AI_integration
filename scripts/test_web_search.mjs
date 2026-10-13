import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

let reply = { results: [] };
let status = 200;
let request;
const upstream = http.createServer((req, res) => {
  request = new URL(req.url, 'http://localhost');
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof reply === 'string' ? reply : JSON.stringify(reply));
});
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
const portProbe = http.createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const child = spawn(process.execPath, ['services/discovery-connector/server.mjs'], {
  env: { ...process.env, PORT: String(port), WEB_CACHE_TTL_MS: '0', SEARXNG_URL: `http://127.0.0.1:${upstream.address().port}`, GOOGLE_MAPS_API_KEY: '', B2B_ALL_URL: `http://127.0.0.1:${upstream.address().port}/b2b` },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const task = { campaign_id: 'test', query_id: 'web-1', source_id: 'web_search', source_type: 'web', query: 'informatique Tunis', language: 'fr', limit_per_query: 1 };
async function discover(body = task) {
  const res = await fetch(`http://127.0.0.1:${port}/v1/discover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  return res.json();
}
try {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Connector failed to start'); })]);
  reply = { results: [{ title: 'Company', url: 'https://example.org/', content: 'IT services' }, { url: 'https://example.com/' }], unresponsive_engines: [['brave', 'rate limited']] };
  let result = await discover();
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.candidate_count, 1);
  assert.match(result.warnings[0], /brave.*rate limited/);
  assert.equal(request.pathname, '/search');
  for (const [key, value] of Object.entries({ q: task.query, format: 'json', language: 'fr', categories: 'general' })) assert.equal(request.searchParams.get(key), value);
  const candidate = result.candidates[0];
  assert.equal(candidate.campaign_id, task.campaign_id);
  assert.equal(candidate.query_id, task.query_id);
  assert.equal(candidate.source_name, 'web_search');
  assert.equal(candidate.checksum, createHash('sha256').update(JSON.stringify(candidate.payload)).digest('hex'));
  reply = { results: [] };
  assert.equal((await discover()).status, 'COMPLETED');
  for (const invalid of ['not json', {}, { results: [], unresponsive_engines: [['google', 'CAPTCHA']] }, { results: [{ url: 'javascript:alert(1)' }] }]) {
    reply = invalid;
    result = await discover();
    assert.equal(result.status, 'SKIPPED');
    assert.equal(result.candidate_count, 0);
    assert.ok(result.warnings.length);
  }
  status = 403;
  assert.match((await discover()).warnings[0], /HTTP 403/);
  const maps = await discover({ ...task, source_id: 'google_maps', source_type: 'maps' });
  assert.equal(maps.status, 'SKIPPED');
  assert.match(maps.warnings[0], /API key/);
  const directory = { ...task, source_id: 'b2b_tn', source_type: 'directory', sector: 'software', location: 'Tunis' };
  assert.equal((await discover(directory)).status, 'SKIPPED', 'upstream HTTP errors should not crash a campaign');
  status = 200;
  reply = 'invalid JSON';
  assert.equal((await discover(directory)).status, 'SKIPPED');
  reply = { get: true, data: [] };
  assert.equal((await discover(directory)).status, 'COMPLETED');
  reply = {get:true,data:[
    {title:'Usine Exemple',categories:['Fabrication industrielle'],address:'Tunis',url:'/industrie'},
    {title:'Clinique Exemple',categories:['Santé médicale'],address:'Tunis',url:'/sante'},
    {title:'Logiciel Exemple',categories:['Services informatiques'],address:'Tunis',url:'/tech'},
  ]};
  for (const sector of ['industry','industrie','health','santé','tech','informatique']) {
    const found = await discover({...directory, sector});
    assert.equal(found.candidate_count,1,sector);
    assert.equal(found.candidates[0].payload.title, /industry|industrie/.test(sector)?'Usine Exemple':/health|santé/.test(sector)?'Clinique Exemple':'Logiciel Exemple');
  }
  await new Promise(resolve => upstream.close(resolve));
  assert.equal((await discover()).status, 'SKIPPED');
  assert.equal((await discover(directory)).status, 'COMPLETED', 'previously retrieved directory records remain available during network failure');
  console.log('PASS B2B.tn HTTP errors, invalid JSON, valid empty result, and network failure');
  console.log('PASS: query parameters, limits, envelopes/checksum, degraded engines, empty success, invalid JSON/schema/URLs, HTTP errors, unavailable provider, Maps missing-key behavior');
} finally {
  child.kill();
  upstream.close();
}
