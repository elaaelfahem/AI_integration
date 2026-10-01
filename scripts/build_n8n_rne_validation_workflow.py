#!/usr/bin/env python3
"""Build the importable n8n RNE official-validation workflow."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_rne_validation.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


example = {
    "normalization": {
        "contract_version": "1.0",
        "campaign_id": "campaign-rne-test-001",
        "status": "COMPLETED",
        "raw_candidate_count": 2,
        "unique_company_count": 2,
        "duplicates_merged": 0,
        "review_required_count": 0,
        "companies": [
            {
                "company_id": "cmp_no_identifier",
                "canonical_name": "Entreprise sans identifiant",
                "legal_identifier": None,
                "source_ids": ["google_maps"],
                "source_records": [{"source_record_id": "src-001"}],
                "review_required": False,
            },
            {
                "company_id": "cmp_with_identifier",
                "canonical_name": "Entreprise Exemple SARL",
                "legal_identifier": "1234567A",
                "source_ids": ["b2b_tn"],
                "source_records": [{"source_record_id": "src-002"}],
                "review_required": False,
            },
        ],
        "warnings": [],
    },
    "official_validation": {
        "enabled": True,
        "source_id": "rne_kyc",
        "mode": "WHEN_IDENTIFIER_AVAILABLE",
        "failure_policy": "REVIEW",
        "enrich": True,
    },
}

example_code = "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"
normalize_webhook = """const incoming = $input.first().json;
let request = incoming.body ?? incoming;
if (Array.isArray(request) && request.length === 1) request = request[0];
if (!request || typeof request !== 'object' || Array.isArray(request)) {
  throw new Error('Webhook body must contain one RNE-validation request');
}
return [{ json: request }];"""

workflow = {
    "id": "rV5n2K8pC1mQ7tL3",
    "name": "DME RNE Validation - Official Enrichment",
    "nodes": [
        {"parameters": {}, "id": "62b4bd0c-1b6a-4447-a9f1-1c34e8cdfa5b", "name": "Manual Trigger", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1080, -180]},
        {"parameters": {"jsCode": example_code}, "id": "d5e834f8-0b41-4d70-8aca-823655619ee4", "name": "Example RNE Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-840, -180]},
        {"parameters": {"httpMethod": "POST", "path": "dme/rne-validate", "responseMode": "lastNode", "options": {}}, "id": "a127da2a-11bc-4405-8257-b89f8290d2c2", "name": "RNE Validation Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [-1080, 80], "webhookId": "d64e4622-c84b-47d6-96c7-990d382246af"},
        {"parameters": {"jsCode": normalize_webhook}, "id": "63b209ae-b9d9-4db8-8e42-60bb44a558ac", "name": "Normalize RNE Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-840, 80]},
        {"parameters": {"jsCode": code("prepare_rne_validation_tasks.js")}, "id": "2423dbf0-328b-453c-81c4-ecb507520a09", "name": "Prepare RNE Validation Tasks", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-560, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("build_rne_connector_request.js")}, "id": "42a37ca6-d48f-4bf2-901f-d78701ff1ff7", "name": "Build RNE Connector Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-280, -40]},
        {"parameters": {"method": "POST", "url": "http://rne-connector:8081/v1/validate", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json }}", "options": {"timeout": 45000}}, "id": "a1cc46b2-1396-43d3-8983-d3cf61dcb17a", "name": "Call RNE Connector", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [0, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_rne_response.js")}, "id": "d68cdfb6-0a9f-43e4-a180-79a8333a197e", "name": "Validate RNE Response", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [280, -40]},
        {"parameters": {"jsCode": code("aggregate_rne_validation.js")}, "id": "16d4952e-832d-42cc-9e3c-15ef52ff455f", "name": "Aggregate RNE Validation", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [560, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_rne_validation_result.js")}, "id": "7f863b1f-5e55-4733-a3c4-19e229f271e6", "name": "Validate RNE Aggregate", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [840, -40]},
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Example RNE Request", "type": "main", "index": 0}]]},
        "Example RNE Request": {"main": [[{"node": "Prepare RNE Validation Tasks", "type": "main", "index": 0}]]},
        "RNE Validation Webhook": {"main": [[{"node": "Normalize RNE Request", "type": "main", "index": 0}]]},
        "Normalize RNE Request": {"main": [[{"node": "Prepare RNE Validation Tasks", "type": "main", "index": 0}]]},
        "Prepare RNE Validation Tasks": {"main": [[{"node": "Build RNE Connector Request", "type": "main", "index": 0}]]},
        "Build RNE Connector Request": {"main": [[{"node": "Call RNE Connector", "type": "main", "index": 0}]]},
        "Call RNE Connector": {"main": [[{"node": "Validate RNE Response", "type": "main", "index": 0}]]},
        "Validate RNE Response": {"main": [[{"node": "Aggregate RNE Validation", "type": "main", "index": 0}]]},
        "Aggregate RNE Validation": {"main": [[{"node": "Validate RNE Aggregate", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "0d22ab43-cd5d-4672-b4d5-20d44665d633",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
