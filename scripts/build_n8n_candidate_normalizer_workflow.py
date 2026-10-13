#!/usr/bin/env python3
"""Build the importable n8n Candidate Normalizer workflow."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_candidate_normalizer.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


def envelope(record_id: str, query_id: str, source: str, url: str, payload: dict) -> dict:
    return {
        "source_record_id": record_id,
        "campaign_id": "campaign-normalizer-test-001",
        "query_id": query_id,
        "source_name": source,
        "source_type": "maps" if source == "google_maps" else "directory",
        "source_url": url,
        "retrieved_at": "2026-09-13T20:00:00.000Z",
        "http_status": 200,
        "content_type": "application/json",
        "checksum": f"checksum-{record_id}",
        "payload": payload,
    }


example = {
    "contract_version": "1.0",
    "campaign_id": "campaign-normalizer-test-001",
    "status": "COMPLETED",
    "queries_attempted": 2,
    "queries_completed": 2,
    "queries_skipped": 0,
    "raw_candidate_count": 3,
    "raw_candidates": [
        envelope("src-001", "q-001", "google_maps", "https://maps.example/place-1", {
            "id": "place-1",
            "displayName": {"text": "Acme Technologies SARL"},
            "formattedAddress": "10 Rue du Lac, Tunis",
            "nationalPhoneNumber": "71 123 456",
            "websiteUri": "https://www.acme.tn/",
            "location": {"latitude": 36.84, "longitude": 10.19},
        }),
        envelope("src-002", "q-002", "b2b_tn", "https://b2b.tn/acme", {
            "title": "ACME Technologies",
            "address": "10 Rue du Lac, Tunis",
            "phone": "+216 71 123 456",
            "website": "acme.tn",
        }),
        envelope("src-003", "q-002", "b2b_tn", "https://b2b.tn/beta", {
            "title": "Beta Digital",
            "address": "Ariana, Tunisie",
            "phone": "70 987 654",
            "website": "https://beta.tn",
        }),
    ],
    "warnings": [],
}

example_code = "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"
normalize_webhook = """const incoming = $input.first().json;
let discovery = incoming.body ?? incoming;
if (Array.isArray(discovery) && discovery.length === 1) discovery = discovery[0];
if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) {
  throw new Error('Webhook body must contain one discovery-result JSON object');
}
return [{ json: discovery }];"""

workflow = {
    "id": "nM4z8Q1cT6vB3kP7",
    "name": "DME Candidate Normalizer - Entity Resolution",
    "nodes": [
        {"parameters": {}, "id": "fc1e79c8-64ea-4b77-b439-3ab915df1693", "name": "Manual Trigger", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-820, -180]},
        {"parameters": {"jsCode": example_code}, "id": "1b7be04a-a80e-4329-940e-bf69063f0f18", "name": "Example Discovery Result", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-580, -180]},
        {"parameters": {"httpMethod": "POST", "path": "dme/normalize-candidates", "responseMode": "lastNode", "options": {}}, "id": "401e4a98-fb74-45af-9ab3-b0bf26c28734", "name": "Discovery Result Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [-820, 80], "webhookId": "530fc590-18ac-4d89-a89f-b55970098886"},
        {"parameters": {"jsCode": normalize_webhook}, "id": "929aa177-e7cc-4b4c-a368-746d951f4a29", "name": "Normalize Webhook Input", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-580, 80]},
        {"parameters": {"jsCode": code("normalize_and_deduplicate_candidates.js")}, "id": "b114408b-14e6-4fca-b4f8-29fa11665e38", "name": "Normalize and Deduplicate", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-280, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_normalization_result.js")}, "id": "ac7011bb-f1c3-4762-9eed-0f14acbd19a2", "name": "Validate Normalized Companies", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [40, -40]},
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Example Discovery Result", "type": "main", "index": 0}]]},
        "Example Discovery Result": {"main": [[{"node": "Normalize and Deduplicate", "type": "main", "index": 0}]]},
        "Discovery Result Webhook": {"main": [[{"node": "Normalize Webhook Input", "type": "main", "index": 0}]]},
        "Normalize Webhook Input": {"main": [[{"node": "Normalize and Deduplicate", "type": "main", "index": 0}]]},
        "Normalize and Deduplicate": {"main": [[{"node": "Validate Normalized Companies", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "b0786847-56c7-42ac-b6e1-7ba92c38d962",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

qualification_node = {
    "parameters": {"method": "POST", "url": "http://discovery-connector:8080/v1/qualify-discovery",
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json }}", "options": {"timeout": 160000}},
    "id": "c226d282-062d-4f72-a8bb-1418bb426920", "name": "Qualify Web Companies",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [-420, -40],
}
workflow["nodes"].append(qualification_node)
for source in ["Example Discovery Result", "Normalize Webhook Input"]:
    workflow["connections"][source]["main"][0][0]["node"] = "Qualify Web Companies"
workflow["connections"]["Qualify Web Companies"] = {"main": [[{"node": "Normalize and Deduplicate", "type": "main", "index": 0}]]}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
