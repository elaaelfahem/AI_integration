#!/usr/bin/env python3
"""Build the n8n workflow that chains research planning into discovery."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_campaign_orchestrator.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


example = json.loads(
    (ROOT / "agents" / "research-planner" / "example.input.json").read_text(encoding="utf-8")
)
example_code = "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"
normalize_code = """const incoming = $input.first().json;
let campaign = incoming.body ?? incoming;
if (Array.isArray(campaign) && campaign.length === 1) campaign = campaign[0];
if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
  throw new Error('Webhook body must contain one campaign JSON object');
}
return [{ json: campaign }];"""

workflow = {
    "id": "oR6c3H9mP2tV7kL4",
    "name": "DME Campaign Orchestrator - Discovery and Enrichment",
    "nodes": [
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/recommend-offers",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { scoring: $json, enable_semantic_explanation: $('Normalize Campaign').item.json.enable_semantic_offer_explanation === true } }}",
                "options": {"timeout": 300000},
            },
            "id": "ed35a9cc-36fb-4996-a79c-5b1e20c7c973",
            "name": "Call Offer Recommender",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1840, -40],
        },
        {
            "parameters": {},
            "id": "2a43252d-4279-4f19-84de-7f61083191ed",
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [-1080, -180],
        },
        {
            "parameters": {"jsCode": example_code},
            "id": "6fb650e9-2ff5-4165-bdf6-e366cdd5e8bf",
            "name": "Example Campaign",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-840, -180],
        },
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "dme/campaign-run",
                "responseMode": "lastNode",
                "options": {},
            },
            "id": "241f4c06-9952-4429-a6a2-f521f8a4b5e9",
            "name": "Campaign Run Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-1080, 80],
            "webhookId": "526a57f2-ed5a-4cf7-ad07-e6165e270d16",
        },
        {
            "parameters": {"jsCode": normalize_code},
            "id": "b1965527-45bf-4029-aac9-eaa825a63898",
            "name": "Normalize Campaign",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-840, 80],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/research-plan",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json }}",
                "options": {"timeout": 300000},
            },
            "id": "b5936dd8-f9ce-44c0-81c1-6d083c07dd84",
            "name": "Call Research Planner",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-560, -40],
        },
        {
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": code("validate_research_plan.js"),
            },
            "id": "de5394c0-6a42-4f68-a74a-20b32f2be71b",
            "name": "Validate Research Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-260, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/discovery-execute",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json }}",
                "options": {"timeout": 300000},
            },
            "id": "b0b2048e-8867-4c33-9569-cdca827ed809",
            "name": "Call Discovery Executor",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [40, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/normalize-candidates",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json }}",
                "options": {"timeout": 300000},
            },
            "id": "d0e39b4a-65e2-4a8b-97a2-23bb10a22ef1",
            "name": "Call Candidate Normalizer",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [340, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/rne-validate",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { normalization: $json, official_validation: $('Normalize Campaign').item.json.official_validation } }}",
                "options": {"timeout": 300000},
            },
            "id": "44752552-19f4-4a02-a3e9-b16998bd14fa",
            "name": "Call RNE Validation",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [640, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/website-enrich",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { official_validation: $json, enable_semantic_extraction: $('Normalize Campaign').item.json.enable_semantic_extraction === true, maximum_enrichment_companies: $('Normalize Campaign').item.json.maximum_enrichment_companies || 10 } }}",
                "options": {"timeout": 900000},
            },
            "id": "5c03e40f-d719-43a6-8585-eab6b1496813",
            "name": "Call Website Enrichment",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [940, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/rne-validate",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { normalization: $json, official_validation: $('Normalize Campaign').item.json.official_validation } }}",
                "options": {"timeout": 300000},
            },
            "id": "a1ab3230-02ca-4fd6-ba7c-4f0539ee91fd",
            "name": "Retry RNE After Enrichment",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1240, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://127.0.0.1:5678/webhook/dme/score-companies",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { official_validation: $json, research_plan: $('Validate Research Plan').item.json, campaign: $('Normalize Campaign').item.json } }}",
                "options": {"timeout": 300000},
            },
            "id": "8af25be3-f94d-4f9d-850c-75a240f530e2",
            "name": "Call Lead Scoring",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1540, -40],
        },
        {
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": code("build_campaign_pipeline_result.js"),
            },
            "id": "e1594eb6-5cca-4524-ac4d-ae44cbf85f46",
            "name": "Build Campaign Result",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2140, -40],
        },
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Example Campaign", "type": "main", "index": 0}]]},
        "Example Campaign": {"main": [[{"node": "Normalize Campaign", "type": "main", "index": 0}]]},
        "Campaign Run Webhook": {"main": [[{"node": "Normalize Campaign", "type": "main", "index": 0}]]},
        "Normalize Campaign": {"main": [[{"node": "Call Research Planner", "type": "main", "index": 0}]]},
        "Call Research Planner": {"main": [[{"node": "Validate Research Plan", "type": "main", "index": 0}]]},
        "Validate Research Plan": {"main": [[{"node": "Call Discovery Executor", "type": "main", "index": 0}]]},
        "Call Discovery Executor": {"main": [[{"node": "Call Candidate Normalizer", "type": "main", "index": 0}]]},
        "Call Candidate Normalizer": {"main": [[{"node": "Call RNE Validation", "type": "main", "index": 0}]]},
        "Call RNE Validation": {"main": [[{"node": "Call Website Enrichment", "type": "main", "index": 0}]]},
        "Call Website Enrichment": {"main": [[{"node": "Retry RNE After Enrichment", "type": "main", "index": 0}]]},
        "Retry RNE After Enrichment": {"main": [[{"node": "Call Lead Scoring", "type": "main", "index": 0}]]},
        "Call Lead Scoring": {"main": [[{"node": "Call Offer Recommender", "type": "main", "index": 0}]]},
        "Call Offer Recommender": {"main": [[{"node": "Build Campaign Result", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "e6b579c9-8d77-4f32-8916-c34a0a174c2d",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
