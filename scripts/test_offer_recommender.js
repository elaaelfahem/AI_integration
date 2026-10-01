#!/usr/bin/env node
const fs=require('fs'); const w=JSON.parse(fs.readFileSync('n8n/dme_offer_recommender.workflow.json','utf8'));
const node=(n)=>w.nodes.find((x)=>x.name===n).parameters.jsCode; const req=new Function(node('Example Offer Request'))()[0].json;
req.scoring.companies.push({company_id:'blocked',scoring:{category:'REVIEW',total_score:90,ready_for_offer_recommendation:false}});
const result=new Function('$input',node('Match Offer Families'))({first:()=>({json:req})})[0].json;
const ok=result.companies[0],blocked=result.companies[1]; if(!ok.offer_recommendation.recommendations.length) throw Error('Eligible evidence should produce recommendations');
if(blocked.offer_recommendation.recommendations.length) throw Error('Blocked company received offers');
if(ok.offer_recommendation.recommendations.some((o)=>o.commercial_details!==null)) throw Error('Commercial details were invented');
console.log(JSON.stringify({status:result.status,recommended:ok.offer_recommendation.recommendations,blocked:blocked.offer_recommendation.status},null,2));
