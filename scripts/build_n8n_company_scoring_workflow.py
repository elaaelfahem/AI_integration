#!/usr/bin/env python3
"""Build the deterministic n8n company-scoring workflow."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_company_scoring.workflow.json"
def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")

example = {"campaign": {"campaign_id": "campaign-score-test-001", "sectors": ["software"], "locations": ["Tunis"]}, "official_validation": {"campaign_id": "campaign-score-test-001", "companies": [{"company_id": "cmp-001", "canonical_name": "Example Software", "sector": "software", "address": "Tunis", "website": "https://example.com", "phones": ["+21670000000"], "emails": ["contact@example.com"], "legal_identifier": "1234567A", "source_ids": ["b2b_tn", "google_maps"], "source_records": [{"source_record_id": "src-001"}], "profile_completeness": 0.85, "ready_for_scoring": True, "official_validation": {"status": "VERIFIED"}}]}}
normalize = """const incoming = $input.first().json;\nlet request = incoming.body ?? incoming;\nif (Array.isArray(request) && request.length === 1) request = request[0];\nif (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Webhook body must contain one scoring request');\nreturn [{ json: request }];"""
workflow = {
  "id": "sC6r3N9mK2pT8vL4", "name": "DME Lead Scoring - Deterministic and Explainable", "active": False,
  "nodes": [
    {"parameters": {}, "id": "8a90df3c-c2ca-4ea3-957d-f1b2ddaba101", "name": "Manual Trigger", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-700,-160]},
    {"parameters": {"jsCode": "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"}, "id": "80789d5f-8380-4ed1-8051-a5ce1346634f", "name": "Example Scoring Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-460,-160]},
    {"parameters": {"httpMethod": "POST", "path": "dme/score-companies", "responseMode": "lastNode", "options": {}}, "id": "f50625e8-161c-4923-9cd3-c3800a501258", "name": "Company Scoring Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [-700,80], "webhookId": "ad202447-1676-431e-b5f5-088f7f7c4bc0"},
    {"parameters": {"jsCode": normalize}, "id": "ba3cc8aa-674d-4d60-a802-40cf1376d7a8", "name": "Normalize Scoring Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-460,80]},
    {"parameters": {"jsCode": code("score_companies.js")}, "id": "efc41aef-dd2b-4121-a4e2-f4a2ec4920bb", "name": "Score Companies", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-160,-40]},
    {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_company_scoring.js")}, "id": "435811f9-c1bb-4107-999c-5ab69b25bfd0", "name": "Validate Scoring Result", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [140,-40]},
  ],
  "connections": {
    "Manual Trigger": {"main": [[{"node":"Example Scoring Request","type":"main","index":0}]]},
    "Example Scoring Request": {"main": [[{"node":"Score Companies","type":"main","index":0}]]},
    "Company Scoring Webhook": {"main": [[{"node":"Normalize Scoring Request","type":"main","index":0}]]},
    "Normalize Scoring Request": {"main": [[{"node":"Score Companies","type":"main","index":0}]]},
    "Score Companies": {"main": [[{"node":"Validate Scoring Result","type":"main","index":0}]]},
  },
  "pinData": {}, "settings": {"executionOrder":"v1"}, "versionId": "5fb23d91-726b-484f-9d1c-0af56e3ddb9e", "meta": {"templateCredsSetupCompleted": True}, "tags": []
}
OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
