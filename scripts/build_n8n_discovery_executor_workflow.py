#!/usr/bin/env python3
"""Build the importable n8n DME Discovery Executor workflow."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_discovery_executor.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


example_plan = {
    "contract_version": "1.0",
    "campaign_id": "campaign-it-grand-tunis-001",
    "queries": [
        {
            "query_id": "q-002",
            "source_id": "b2b_tn",
            "source_type": "directory",
            "language": "fr",
            "query": "sociétés de services informatiques à Tunis",
            "sector": "IT services",
            "location": "Tunis",
            "intent": "Découvrir des sociétés de services informatiques à Tunis",
            "priority": 1,
        }
    ],
    "stop_conditions": {"maximum_queries": 40, "maximum_candidates": 20},
    "warnings": [],
    "query_count": 1,
}

example_code = "return [{ json: " + json.dumps(example_plan, ensure_ascii=False) + " }];"
normalize_code = """const incoming = $input.first().json;
let plan = incoming.body ?? incoming;
if (Array.isArray(plan) && plan.length === 1) plan = plan[0];
if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
  throw new Error('Webhook body must contain one research-plan JSON object');
}
return [{ json: plan }];"""

workflow = {
    "id": "dE7q9C2mL5xN8pR1",
    "name": "DME Discovery Executor - Source Connectors",
    "nodes": [
        {
            "parameters": {},
            "id": "cd8b50b9-a501-465c-b380-dda6b5f5ff9d",
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [-980, -180],
        },
        {
            "parameters": {"jsCode": example_code},
            "id": "0812f13c-f456-471d-b29a-2cc621669171",
            "name": "Example B2B Research Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-740, -180],
        },
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "dme/discovery-execute",
                "responseMode": "lastNode",
                "options": {},
            },
            "id": "c37549bd-af14-418b-aaf8-3ca80e1e21e2",
            "name": "Research Plan Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-980, 80],
            "webhookId": "b7072d56-76a9-4de0-bb09-b877af622b0b",
        },
        {
            "parameters": {"jsCode": normalize_code},
            "id": "bb3eddfa-9d7a-4bf1-a247-adb11fbd8a6e",
            "name": "Normalize Research Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-740, 80],
        },
        {
            "parameters": {"jsCode": code("expand_discovery_queries.js")},
            "id": "95ef20c6-ec8e-49cc-a104-6b289730eefb",
            "name": "Expand Discovery Queries",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-460, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://discovery-connector:8080/v1/discover",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json }}",
                "options": {"timeout": 60000},
            },
            "id": "0a93c026-85ea-49d9-87df-aedfd0f0a341",
            "name": "Call Discovery Connector",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-160, -40],
        },
        {
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": code("validate_discovery_response.js"),
            },
            "id": "7a28705c-a619-4492-b51a-e2553519c1ee",
            "name": "Validate Discovery Response",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [140, -40],
        },
        {
            "parameters": {"jsCode": code("aggregate_discovery_run.js")},
            "id": "7ebd6747-8dcb-4783-ae32-a6654fe5ae5b",
            "name": "Aggregate Discovery Run",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [440, -40],
        },
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Example B2B Research Plan", "type": "main", "index": 0}]]},
        "Example B2B Research Plan": {"main": [[{"node": "Expand Discovery Queries", "type": "main", "index": 0}]]},
        "Research Plan Webhook": {"main": [[{"node": "Normalize Research Plan", "type": "main", "index": 0}]]},
        "Normalize Research Plan": {"main": [[{"node": "Expand Discovery Queries", "type": "main", "index": 0}]]},
        "Expand Discovery Queries": {"main": [[{"node": "Call Discovery Connector", "type": "main", "index": 0}]]},
        "Call Discovery Connector": {"main": [[{"node": "Validate Discovery Response", "type": "main", "index": 0}]]},
        "Validate Discovery Response": {"main": [[{"node": "Aggregate Discovery Run", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "a153e264-89c7-4454-8953-ff5227a3d4a5",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
