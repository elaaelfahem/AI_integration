# Campaign form implementation and checks

Form: http://localhost:5678/form/8ed66a1c-acbb-4dcc-82ea-ca951ca50194
Workflow: http://localhost:5678/workflow/hSPenzJ40fhRhNdH

Five fields: required campaign name, sectors and governorates; optional keywords; numeric maximum candidates (default 200). List fields accept comma-separated values, trim whitespace and remove duplicates. Candidate limits must be integers from 1 through 200. At most 40 sector/location combinations. Existing discovery-source configurations and RNE policy are defaults; provider access is not established by this form. No employee-size or exclusion filters are silently added.

Path: On form submission → Build Campaign From Form → Prepare Query Tasks → Call Flowise Query Composer → Validate Composed Query → Aggregate Query Plan.

The form waits for workflow completion. This workflow prepares searches only. Existing manual and webhook entry points remain intact.

## Evidence
- Live test execution 113: software / Tunis / cloud, cybersecurity / 2 candidates. Campaign ID campaign-form-113. All six form-path nodes completed.
- Final output: one French Google Maps query, “sociétés de logiciels à Tunis”; maximum_candidates 2 and maximum_queries 40.
- Existing deterministic fallback corrected model wording; warning retained: “Deterministic fallback used for q-001”. This is a fallback-assisted pass.
- Empty form submission showed required-field errors for name, sectors and governorates.
- Local converter checks passed: lists, duplicates, trimming, ID, optional keywords, default limit, rejected 0/-1/201/2.5/non-numeric limits, whitespace-only required fields, and over 40 sector/location combinations.
- Generator smoke check passed for form/mapping parameters and connections after normalizing a trailing newline in the local mapping source.
- Published version: Campaign form intake. Permanent form URL opened successfully.

User review of the full research-planner task remains pending. The earlier webhook's generic HTTP 500 behavior is unchanged. Broader source/language coverage is untested.
