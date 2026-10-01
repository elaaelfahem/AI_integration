# Task 01 — Research planner and query composer

Status: Tested; error handling needs improvement. Awaiting user review; not Done.

## Purpose
Campaign criteria become search tasks. Flowise composes the phrases; n8n validates and combines them. No company discovery is executed here.

## Live tests — 2026-09-29
- Normal input: software companies in Tunis, French, B2B.tn, at most one query and two candidates.
- Actual: HTTP 200 in 19.05 seconds; “Recherche de sociétés de logiciels à Tunis”.
- Assertions passed: campaign ID, one query, source, language, sector, location and stop limits. No RNE discovery query; warnings empty.
- Invalid input: same campaign with sectors set to an empty list.
- Actual: HTTP 500 in 0.23 seconds; {"message":"Error in workflow"}.
- Finding: processing stops, but the caller receives no useful missing-sector explanation. Follow-up: return a clear validation message with an appropriate client-error status, then retest.

## Evidence
normal-input.json, normal-result.json, invalid-input.json, invalid-result.json.

Runtime: existing b2b-n8n container started and left running; Flowise and Ollama were already healthy. No workflow code changes made.
Workflow: http://localhost:5678/workflow/hSPenzJ40fhRhNdH

Coverage: one live happy path and one live invalid-input case. Other languages, sources and boundary cases have not been validated by this session. User review is pending.

## Retest — 2026-09-30

The live workflow was corrected and republished.

- Full campaign: 2 sectors × 4 governorates × French/English returned 16 validated queries.
- Repeated sector and governorate values returned two unique queries only.
- Arabic returned one `web_search` query with Arabic query and intent text. The validator applied its deterministic Arabic fallback because the composer initially responded in English.
- The planner now rejects zero query limits and chooses only sources that support the requested language.

The underlying validation is fixed. The remaining follow-up is response presentation: n8n still turns a rejected webhook request into its generic HTTP 500 response instead of returning the specific validation message to the caller.
