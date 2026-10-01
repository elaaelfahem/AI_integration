#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'n8n'/'dme_offer_recommender.workflow.json'
code=lambda name:(ROOT/'n8n'/name).read_text(encoding='utf-8')
catalog=json.loads((ROOT/'config'/'orange_offer_catalog.json').read_text(encoding='utf-8'))
normalize="""const incoming=$input.first().json; let request=incoming.body??incoming; if(Array.isArray(request)&&request.length===1) request=request[0]; if(!request||typeof request!=='object'||Array.isArray(request)) throw new Error('Webhook body must contain one offer request'); return [{json:{...request,offer_catalog:"""+json.dumps(catalog,ensure_ascii=False)+"""}}];"""
example={"scoring":{"campaign_id":"campaign-offer-test","companies":[{"company_id":"cmp-1","canonical_name":"Cloud Software Tunisia","description":"software cloud company","website":"https://example.com","emails":["sales@example.com"],"scoring":{"category":"A","total_score":82,"ready_for_offer_recommendation":True}}]}}
workflow={"id":"fR7m2K9cN4pT8vL1","name":"DME Offer Recommender - Evidence Guarded","active":False,"nodes":[
{"parameters":{},"id":"f8c5e2bb-d15d-4493-b126-2ee816678329","name":"Manual Trigger","type":"n8n-nodes-base.manualTrigger","typeVersion":1,"position":[-700,-160]},
{"parameters":{"jsCode":"return [{json:"+json.dumps({**example,"offer_catalog":catalog},ensure_ascii=False)+"}];"},"id":"f51adb7f-a120-499a-bae2-530fc24edab5","name":"Example Offer Request","type":"n8n-nodes-base.code","typeVersion":2,"position":[-450,-160]},
{"parameters":{"httpMethod":"POST","path":"dme/recommend-offers","responseMode":"lastNode","options":{}},"id":"00f4ee87-5960-4f4b-a8ae-95ef9ca95aee","name":"Offer Recommender Webhook","type":"n8n-nodes-base.webhook","typeVersion":2,"position":[-700,80],"webhookId":"2e332edc-a5e3-4236-bfb3-297a76b05bdd"},
{"parameters":{"jsCode":normalize},"id":"7a6606a3-b02c-48fc-8ff0-9950ad6ac974","name":"Normalize Offer Request","type":"n8n-nodes-base.code","typeVersion":2,"position":[-450,80]},
{"parameters":{"jsCode":code('recommend_offers.js')},"id":"4a857a7a-d988-4d4f-b586-41e935c8f54d","name":"Match Offer Families","type":"n8n-nodes-base.code","typeVersion":2,"position":[-140,-40]},
{"parameters":{"mode":"runOnceForEachItem","jsCode":code('validate_offer_recommendations.js')},"id":"d62e7b67-a398-4074-a617-d08812b0197d","name":"Validate Offer Recommendations","type":"n8n-nodes-base.code","typeVersion":2,"position":[180,-40]}],
"connections":{"Manual Trigger":{"main":[[{"node":"Example Offer Request","type":"main","index":0}]]},"Example Offer Request":{"main":[[{"node":"Match Offer Families","type":"main","index":0}]]},"Offer Recommender Webhook":{"main":[[{"node":"Normalize Offer Request","type":"main","index":0}]]},"Normalize Offer Request":{"main":[[{"node":"Match Offer Families","type":"main","index":0}]]},"Match Offer Families":{"main":[[{"node":"Validate Offer Recommendations","type":"main","index":0}]]}},"pinData":{},"settings":{"executionOrder":"v1"},"versionId":"50f1e9fa-5717-4a33-8fd3-5d058ad49076","meta":{"templateCredsSetupCompleted":True},"tags":[]}
OUTPUT.write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(OUTPUT)
