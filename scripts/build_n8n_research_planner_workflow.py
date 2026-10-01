#!/usr/bin/env python3
"""Build an importable n8n workflow for the DME research planner."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_research_planner.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


example = json.loads(
    (ROOT / "agents" / "research-planner" / "example.input.json").read_text(
        encoding="utf-8"
    )
)

example_code = "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"
normalize_code = """const incoming = $input.first().json;
const campaign = incoming.body ?? incoming;
if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
  throw new Error('Webhook body must contain one campaign JSON object');
}
return [{ json: campaign }];"""

workflow = {
    "name": "DME Research Planner - Flowise Query Composer",
    "nodes": [
        {
            "parameters": {},
            "id": "0ba5859e-772a-47fc-bb38-cf47d11af3ee",
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [-980, -180],
        },
        {
            "parameters": {"jsCode": example_code},
            "id": "7ec70eaa-ef69-423f-80ea-23d399b404cc",
            "name": "Example Campaign",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-760, -180],
        },
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "dme/research-plan",
                "responseMode": "lastNode",
                "options": {},
            },
            "id": "ebfc7d94-2cad-4975-83fe-22af56ae44b0",
            "name": "Campaign Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [-980, 80],
            "webhookId": "58ea2876-5e5e-49ca-b9bc-d00ded177bf1",
        },
        {
            "parameters": {"jsCode": normalize_code},
            "id": "15dbb49e-f8ac-4675-a660-59e541cb730e",
            "name": "Normalize Webhook Campaign",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-760, 80],
        },
        {
            "parameters": {"jsCode": code("prepare_query_tasks.js")},
            "id": "64bb8513-ef4f-475d-a698-570612d55d15",
            "name": "Prepare Query Tasks",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [-500, -40],
        },
        {
            "parameters": {
                "method": "POST",
                "url": "http://flowise:3000/api/v1/prediction/59650638-53f6-4339-bbfa-6d21be5fbf5a",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ { question: JSON.stringify($json), overrideConfig: { sessionId: $json.campaign_id + '-' + $json.query_id } } }}",
                "options": {"timeout": 300000},
            },
            "id": "917013bf-1883-4e42-9a86-b8cf23079322",
            "name": "Call Flowise Query Composer",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [-220, -40],
        },
        {
            "parameters": {
                "mode": "runOnceForEachItem",
                "jsCode": code("validate_composed_query.js"),
            },
            "id": "3b8b7c20-966f-4c77-a178-417f53bb095b",
            "name": "Validate Composed Query",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [60, -40],
        },
        {
            "parameters": {"jsCode": code("aggregate_query_plan.js")},
            "id": "75f94b9c-62fb-4097-abba-f1864e21d6ac",
            "name": "Aggregate Query Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [340, -40],
        },
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {
            "main": [[{"node": "Example Campaign", "type": "main", "index": 0}]]
        },
        "Example Campaign": {
            "main": [[{"node": "Prepare Query Tasks", "type": "main", "index": 0}]]
        },
        "Campaign Webhook": {
            "main": [[{"node": "Normalize Webhook Campaign", "type": "main", "index": 0}]]
        },
        "Normalize Webhook Campaign": {
            "main": [[{"node": "Prepare Query Tasks", "type": "main", "index": 0}]]
        },
        "Prepare Query Tasks": {
            "main": [[{"node": "Call Flowise Query Composer", "type": "main", "index": 0}]]
        },
        "Call Flowise Query Composer": {
            "main": [[{"node": "Validate Composed Query", "type": "main", "index": 0}]]
        },
        "Validate Composed Query": {
            "main": [[{"node": "Aggregate Query Plan", "type": "main", "index": 0}]]
        },
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "2b173586-a009-407b-beaf-fdb371358943",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

# Keep the form branch alongside the original manual and webhook entry points.
form_node = json.loads((ROOT / "config" / "research_campaign_form.json").read_text(encoding="utf-8"))
workflow["nodes"].extend([
    form_node,
    {
        "parameters": {"jsCode": code("build_campaign_from_form.js")},
        "id": "f890349c-2bfa-491f-afea-fcc57b450298",
        "name": "Build Campaign From Form",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [-760, 340],
    },
])
workflow["connections"]["On form submission"] = {
    "main": [[{"node": "Build Campaign From Form", "type": "main", "index": 0}]]
}
workflow["connections"]["Build Campaign From Form"] = {
    "main": [[{"node": "Prepare Query Tasks", "type": "main", "index": 0}]]
}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
