# Website and contact enrichment

## Runtime flow

1. n8n receives companies from the initial RNE policy pass.
2. The Website Collector fetches a bounded set of public same-domain pages.
3. The Fact Extraction Gateway always extracts deterministic email, phone, social-link, and contextual legal-identifier evidence.
4. Flowise semantic extraction runs only when `enable_semantic_extraction` is `true`.
5. n8n validates source URLs, evidence, confidence, company IDs, and record counts.
6. Newly discovered legal identifiers are passed through RNE validation again.

## Campaign controls

- `maximum_enrichment_companies`: maximum websites processed in one campaign execution. The orchestrator defaults to 10. Remaining companies are preserved with `NOT_ATTEMPTED_LIMIT`.
- `enable_semantic_extraction`: enables the Flowise `fact_extractor`. It currently defaults to `false` because the local `llama3.2` model exceeded the two-minute latency target during testing.

## Safety controls

- HTTP(S) only.
- Private, loopback, link-local, and unsafe IP targets blocked.
- Cross-domain redirects blocked, except equivalent `www` host changes.
- Five pages maximum per company.
- One megabyte maximum per page.
- Fifteen-second request timeout per page.
- Basic `robots.txt` exclusions honored.
- Scripts, styles, SVG, comments, and HTML tags removed before extraction.
- Every accepted fact retains a source URL, evidence text, confidence, and extraction method.

## Endpoints

- n8n: `POST http://localhost:5678/webhook/dme/website-enrich`
- Website Collector health: `GET http://localhost:8082/health`
- Fact Extraction Gateway health: `GET http://localhost:8083/health`

Clients normally use the main campaign endpoint, which invokes enrichment automatically:

`POST http://localhost:5678/webhook/dme/campaign-run`
