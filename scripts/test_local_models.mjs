import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
let output={answer:'Confirmez les besoins de ACME avant de proposer Data.'}; let calls=0;
const upstream=http.createServer(async(q,r)=>{for await(const c of q){} calls++;r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify(output)}}));});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const children=[];
async function start(service){const probe=http.createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));const child=spawn(process.execPath,[`services/${service}/server.mjs`],{env:{...process.env,PORT:String(port),OLLAMA_URL:`http://127.0.0.1:${upstream.address().port}`},stdio:['ignore','pipe','inherit']});children.push(child);await once(child.stdout,'data');return async(path,body)=>(await fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();}
try{
 const assist=await start('dme-assistant-gateway');
 const input={company:{company_id:'test',canonical_name:'ACME',scoring:{total_score:54,category:'B',ready_for_offer_recommendation:true},offer_recommendation:{recommendations:[{offer_name:'Data'}]}},user_question:'Préparer la visite',enable_ai:true};
 let result=await assist('/v1/assist',input);assert.equal(result.model_used,true);assert.equal(result.company_id,'test');assert.ok(result.key_facts.includes('Score: 54 / 100'));
 output={answer:'Le tarif est 999 dinars.'};result=await assist('/v1/assist',input);assert.equal(result.model_used,false);
 const before=calls;result=await assist('/v1/assist',{...input,company:{...input.company,scoring:{...input.company.scoring,ready_for_offer_recommendation:false}}});assert.equal(result.model_used,false);assert.equal(calls,before);assert.match(result.answer,/revue/);
 const clean=await start('report-cleaner-gateway');
 const report={company_id:'report-123',raw_report:'Le client cherche une connexion stable. Envoyer une proposition demain.',enable_ai:true};
 output={summary:[0],observations:[],needs:[0],objections:[],commitments:[],next_actions:[1]};result=await clean('/v1/clean',report);assert.equal(result.model_used,true);assert.equal(result.original_report,report.raw_report);assert.equal(result.needs[0].evidence_text,'Le client cherche une connexion stable.');
 output={...output,needs:[99]};assert.equal((await clean('/v1/clean',report)).model_used,false);
 console.log('PASS local generation, authoritative facts, invented-number rejection, review gate, exact report evidence and invalid-index fallback');
}finally{children.forEach(c=>c.kill());upstream.close();}
