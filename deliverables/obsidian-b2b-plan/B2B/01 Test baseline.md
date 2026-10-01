# Test baseline — 2026-09-28

Checked at `2026-09-28T12:44:30.522078+00:00`. Commands ran from `/home/lalou/Documents/ChatGPT/B2B`. This baseline is intentionally limited to existing offline regressions and local health probes.

| Existing offline suite | Result | Card |
| --- | --- | --- |
| Candidate normalization | PASS | [[B2B/Tasks/B2B-016|B2B-016]] |
| RNE validation policies | PASS | [[B2B/Tasks/B2B-017|B2B-017]] |
| Lead scoring | PASS | [[B2B/Tasks/B2B-018|B2B-018]] |
| Offer recommendation | PASS | [[B2B/Tasks/B2B-019|B2B-019]] |

These scripts execute code embedded in the committed n8n workflow exports against synthetic fixtures. They do not prove the deployed Flowise export behaves identically or that live providers work.

## Runtime observations

| Service | Observation |
| --- | --- |
| Ollama, port 11434 | HTTP 200 from `/api/tags`; inference not tested |
| Flowise, port 3000 | `/api/v1/ping` timed out after 3 seconds |
| n8n, port 5678 | Connection refused |
| Gateways, ports 8080–8086 | Connections refused |

The old gateways need not be running if all-in-one is selected. No live campaign or AI inference acceptance test was run during this planning task. The sandbox harness also has a missing hard-coded runtime location and a temporary export path assumption; see [[B2B/Tasks/B2B-004]]. No paid-source calls were made.

## Reproduce the completed checks

```bash
cd /home/lalou/Documents/ChatGPT/B2B
node scripts/test_candidate_normalizer.js
node scripts/test_rne_validation.js
node scripts/test_company_scoring.js
node scripts/test_offer_recommender.js
```

[[B2B/Evidence/planning-baseline-2026-09-28.json|Raw outputs and health results]] · [[B2B/00 Start here|Project guide]]
