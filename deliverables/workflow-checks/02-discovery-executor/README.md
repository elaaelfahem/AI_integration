# Task 02 — Discovery executor

Status: Core workflow validated; shared error-message polish remains.

## What it does
It receives a research plan, expands it into one task per discovery source, calls the local Discovery Connector, and returns raw source evidence. It does not normalize or score companies.

## Live checks — 2026-09-30

- B2B.tn run: one French query for IT services in Tunis, with a maximum of three candidates.
- Initial result exposed a location-matching bug: `Tunis` matched the country word `Tunisie`, allowing a Bizerte construction company through.
- Fix: city matching now requires a complete normalized location phrase rather than a substring.
- Retest: HTTP 200; three candidates returned. Each has a Tunis address and an IT-services or computer-services category.
- Candidate limit: three requested and three raw candidates returned.
- Evidence fields included a source URL, retrieval timestamp, HTTP status, payload, and checksum for each candidate.

## Invalid input

- Empty `queries` list: workflow stopped with HTTP 500.
- Remaining UX item: n8n returns its generic `{"message":"Error in workflow"}` response instead of the specific validation explanation.

## Source access

- `b2b_tn`: working without an API key.
- `google_maps`: already configured with an existing key; not called during this validation.
- `web_search`: intentionally skipped until a search provider is configured.

Workflow: http://localhost:5678/workflow/dE7q9C2mL5xN8pR1

## SearXNG web-search source — 2026-09-30

- Installed local-only SearXNG at http://localhost:8081 on the shared Docker network.
- Full Discovery Executor test: one English `web_search` query for software companies in Tunis returned three raw web results with status `COMPLETED` and no warnings.
- The connector preserves each result's title, URL, summary, engines, score, timestamp, and checksum.
- No search-provider API key is required. Some upstream engines may rate-limit requests; SearXNG continues with engines that respond.
