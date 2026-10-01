#!/usr/bin/env python3
"""Build the importable n8n website and contact enrichment workflow."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "n8n" / "dme_website_enrichment.workflow.json"


def code(name: str) -> str:
    return (ROOT / "n8n" / name).read_text(encoding="utf-8")


def company(company_id: str, name: str, website: str | None) -> dict:
    return {
        "company_id": company_id,
        "canonical_name": name,
        "legal_identifier": None,
        "website": website,
        "websites": [website] if website else [],
        "domains": [website.replace("https://", "")] if website else [],
        "phones": [],
        "emails": [],
        "address": None,
        "source_ids": ["test"],
        "source_records": [{"source_record_id": f"source-{company_id}"}],
        "review_required": False,
        "official_validation": {"provider": "RNE", "status": "SKIPPED_NO_IDENTIFIER"},
        "ready_for_scoring": True,
    }


example = {
    "official_validation": {
        "contract_version": "1.0",
        "campaign_id": "campaign-website-test-001",
        "status": "COMPLETED",
        "company_count": 2,
        "companies": [
            company("cmp_example", "Example Domain", "https://example.com"),
            company("cmp_no_website", "No Website Company", None),
        ],
        "warnings": [],
    },
    "enable_semantic_extraction": False,
    "maximum_enrichment_companies": 10,
}

example_code = "return [{ json: " + json.dumps(example, ensure_ascii=False) + " }];"
normalize_webhook = """const incoming = $input.first().json;
let request = incoming.body ?? incoming;
if (Array.isArray(request) && request.length === 1) request = request[0];
if (!request || typeof request !== 'object' || Array.isArray(request)) {
  throw new Error('Webhook body must contain one website-enrichment request');
}
return [{ json: request }];"""

workflow = {
    "id": "wE4b7N1mK9pQ2tC6",
    "name": "DME Website and Contact Enrichment",
    "nodes": [
        {"parameters": {}, "id": "a93ae9f0-8490-4514-a24b-fd9294ecddf8", "name": "Manual Trigger", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1240, -180]},
        {"parameters": {"jsCode": example_code}, "id": "371bdad6-1f88-47c4-9e5a-e983a4c31d2e", "name": "Example Enrichment Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-1000, -180]},
        {"parameters": {"httpMethod": "POST", "path": "dme/website-enrich", "responseMode": "lastNode", "options": {}}, "id": "59236643-326b-4984-b548-e083da048aa4", "name": "Website Enrichment Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [-1240, 80], "webhookId": "db017f25-fbec-43e5-ac67-f2e7c842d722"},
        {"parameters": {"jsCode": normalize_webhook}, "id": "fbbcbf73-706d-4d99-ac3d-f5f83cfa3f38", "name": "Normalize Enrichment Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-1000, 80]},
        {"parameters": {"jsCode": code("prepare_website_enrichment_tasks.js")}, "id": "729f08e7-8bea-4ede-bdca-fba2d99df18c", "name": "Prepare Website Enrichment Tasks", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-720, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("build_website_collector_request.js")}, "id": "e751ab66-fbea-4a7f-a549-c34807dcafcb", "name": "Build Website Collector Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [-440, -40]},
        {"parameters": {"method": "POST", "url": "http://website-collector:8082/v1/collect", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json }}", "options": {"timeout": 90000}}, "id": "393e0f5e-4be6-49ad-bc9c-bf5a289a0c22", "name": "Call Website Collector", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [-160, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_website_collection.js")}, "id": "46fc0c2b-07a6-4ae0-82a5-cde0ebd2e684", "name": "Validate Website Collection", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [120, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("build_fact_extraction_request.js")}, "id": "6d95b4e8-ed16-4e0d-a479-1a08edc5a666", "name": "Build Fact Extraction Request", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, -40]},
        {"parameters": {"method": "POST", "url": "http://fact-extraction-gateway:8083/v1/extract", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ $json }}", "options": {"timeout": 120000}}, "id": "fc77c593-7575-40f9-889a-dfdc4f97ec7a", "name": "Extract Evidence-backed Facts", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [680, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_extraction_result.js")}, "id": "1a9f5422-c3b7-4ea0-bd96-7eeb67ed6eab", "name": "Validate Extracted Facts", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [960, -40]},
        {"parameters": {"jsCode": code("aggregate_website_enrichment.js")}, "id": "5a543fc7-3b9e-45ed-8e5d-f5390fca8827", "name": "Aggregate Website Enrichment", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1240, -40]},
        {"parameters": {"mode": "runOnceForEachItem", "jsCode": code("validate_website_enrichment_result.js")}, "id": "44ad6c3a-4595-4091-841d-48c77d63c8f3", "name": "Validate Enrichment Result", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1520, -40]},
    ],
    "pinData": {},
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Example Enrichment Request", "type": "main", "index": 0}]]},
        "Example Enrichment Request": {"main": [[{"node": "Prepare Website Enrichment Tasks", "type": "main", "index": 0}]]},
        "Website Enrichment Webhook": {"main": [[{"node": "Normalize Enrichment Request", "type": "main", "index": 0}]]},
        "Normalize Enrichment Request": {"main": [[{"node": "Prepare Website Enrichment Tasks", "type": "main", "index": 0}]]},
        "Prepare Website Enrichment Tasks": {"main": [[{"node": "Build Website Collector Request", "type": "main", "index": 0}]]},
        "Build Website Collector Request": {"main": [[{"node": "Call Website Collector", "type": "main", "index": 0}]]},
        "Call Website Collector": {"main": [[{"node": "Validate Website Collection", "type": "main", "index": 0}]]},
        "Validate Website Collection": {"main": [[{"node": "Build Fact Extraction Request", "type": "main", "index": 0}]]},
        "Build Fact Extraction Request": {"main": [[{"node": "Extract Evidence-backed Facts", "type": "main", "index": 0}]]},
        "Extract Evidence-backed Facts": {"main": [[{"node": "Validate Extracted Facts", "type": "main", "index": 0}]]},
        "Validate Extracted Facts": {"main": [[{"node": "Aggregate Website Enrichment", "type": "main", "index": 0}]]},
        "Aggregate Website Enrichment": {"main": [[{"node": "Validate Enrichment Result", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "versionId": "ca295c6a-2139-4fb6-85e6-f17af8c507b7",
    "meta": {"templateCredsSetupCompleted": True},
    "tags": [],
}

OUTPUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUTPUT)
