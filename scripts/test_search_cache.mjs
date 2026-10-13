import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
let fail=false,calls=0;
const upstream=http.createServer((q,r)=>{calls++;r.writeHead(fail?429:200,{'content-type':'application/json'});r.end(JSON.stringify({results:[{url:'https://example.org',title:'Example'}]}));}).listen(0,'127.0.0.1');await once(upstream,'listening');
const probe=http.createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn(process.execPath,['services/discovery-connector/server.mjs'],{env:{...process.env,PORT:String(port),SEARXNG_URL:`http://127.0.0.1:${upstream.address().port}`,WEB_CACHE_TTL_MS:'900000'},stdio:['ignore','pipe','inherit']});
async function search(id,query='software Tunis'){return (await fetch(`http://127.0.0.1:${port}/v1/discover`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaign_id:id,query_id:id,source_id:'web_search',source_type:'web',query})})).json();}
try{await once(child.stdout,'data');const first=await search('first');assert.equal(first.candidate_count,1);fail=true;const cached=await search('second');assert.equal(cached.candidate_count,1);assert.equal(cached.candidates[0].campaign_id,'second');assert.equal(cached.candidates[0].retrieved_at,first.candidates[0].retrieved_at);assert.match(cached.warnings.join(' '),/previously retrieved/);const n=calls;const missing=await search('third','unrelated');assert.equal(missing.status,'SKIPPED');assert.equal(missing.candidate_count,0);assert.equal(calls,n);console.log('PASS exact-query cached fallback preserves evidence timestamp, rebinds IDs, and cooldown does not invent results');}finally{child.kill();upstream.close();}
