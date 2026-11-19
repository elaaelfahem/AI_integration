# DME AI integration handoff

This guide describes the current implementation on branch `application-ai-integration`. It is based on the NestJS controllers/services, the Docker Compose files, the n8n exports, and the Flowise exports in this repository. AI URLs and provider credentials stay server-side.

## Architecture and request flow

The web client calls the NestJS API. The API authenticates the caller, applies role/company scoping, validates input and persists prospecting state. `AiService` calls internal services; browser code must never call n8n, Flowise, Ollama, or provider APIs directly.

Prospecting: web client → NestJS `/prospecting/runs` → n8n campaign orchestrator (`/webhook/dme/campaign-run`) → research planning, discovery, normalization, website enrichment, RNE validation, scoring and offer recommendation. The discovery connector combines configured directory/search/maps sources and returns source envelopes (URL, retrieval time and checksum). The website collector fetches same-site pages. Fact extraction uses its Flowise flow through a gateway. NestJS validates results and stores company/run evidence and snapshots. The API also exposes evidence-backed dossier/report views.

Assistant and report cleanup: web client → authenticated NestJS `/ai/...` → assistant/report-cleaner gateway → Flowise flow, with local Ollama support configured in the Compose files. Deterministic fallback behavior is implemented in the gateway. Other exported flows include risk detection and offer recommendation.

The checked-in implementation uses Flowise and Ollama; no FAISS index, vector database, or FAISS-specific runtime/configuration was found in the inspected integration paths. The evidence/RAG-like behavior here is source-backed research and stored company context. Do not add a FAISS prerequisite unless the deployment is changed.

## Prerequisites

- Docker Engine and Compose plugin; Node.js and pnpm/npm versions compatible with each app's package manifest.
- PostgreSQL for the backend. Local Compose exposes it only on `127.0.0.1:55432`.
- The separately managed Flowise installation and its `docker_default` network, plus Ollama on the configured host if using local models. The local scripts assume these already exist; Flowise itself is not started by this repository's compose files.
- n8n is defined in `deployment/n8n/docker-compose.yml`; the local startup script assumes the named n8n container/network already exists and starts it if present.
- Optional provider access (for example paid search, Google Maps, or RNE) must be configured outside the repository. Discovery still supports configured free/public sources when optional credentials are absent.

## Configuration and secrets

Copy `applications/dme_backend-main/.env.example` to the backend's ignored `.env.local`, and `applications/dme_frontend-main/.env.example` to the frontend's ignored `.env.local`. Set real local database/JWT/admin/mail values; do not commit either file. `deployment/application/.env.example` is a placeholder for `POSTGRES_PASSWORD`; copy it to ignored `deployment/application/.env` and replace the placeholder. Never put credentials in workflow exports or `NEXT_PUBLIC_*` values.

Backend AI variables (from the checked-in template):

| Variable | Purpose |
| --- | --- |
| `AI_N8N_URL` | n8n base URL; NestJS posts the campaign webhook at `/webhook/dme/campaign-run`. |
| `AI_DISCOVERY_URL` | Discovery connector base URL; used for exclusions, public evidence and website resolution. |
| `AI_WEBSITE_COLLECTOR_URL` | Website collector base URL. |
| `AI_ASSISTANT_URL` | Assistant gateway base URL. |
| `AI_REPORT_CLEANER_URL` | Report-cleaner gateway base URL. |
| `AI_RISK_URL` | Risk gateway base URL (configured in template for related integration). |
| `AI_ENABLE_MODEL` | Enables model use in the API/gateway request. |
| `AI_SERVICE_TOKEN` | Optional bearer token sent by NestJS to upstream services; only configure if gateway auth is enabled in deployment. |

The checked-in local defaults use n8n `127.0.0.1:5678`, discovery `:8080`, website collector `:8084`, assistant `:8085`, report cleaner `:8086`, and risk `:8087`. `PORT`, `HOST`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, and `FRONTEND_URL` are backend settings. Frontend `NEXT_PUBLIC_API_URL` points to the NestJS API, not an AI service. The Compose files also use `ALLOW_PAID_SEARCH`, `DISCOVERY_ENV_FILE`, `B2B_DNS_SERVER`, `OSM_USER_AGENT`, `RNE_API_BASE_URL`, `RNE_LOOKUP_PATH_TEMPLATE`, `RNE_AUTH_MODE`, `RNE_API_KEY_HEADER`, and a mounted RNE key file; see their defaults in `deployment/*/docker-compose.yml` and `deployment/rne-connector/.env.example`.

## Start services

From repository root, configure both application `.env.local` files and build the frontend/backend using their documented package scripts first. The checked-in script explicitly requires built artifacts and does not build or migrate them:

```bash
./scripts/start-application-local.sh
```

It starts the Compose files for application/Postgres, SearXNG, discovery connector, website collector, fact extraction, RNE, assistant, report cleaner and risk gateway, then starts existing built backend/frontend services. This local script includes host-specific systemd and existing Docker-network assumptions; on another machine use the individual Compose files and provide equivalent Flowise/Ollama/network setup.

To start a Compose service individually (from the repository root), use the matching file, for example:

```bash
docker compose -f deployment/application/docker-compose.yml up -d
docker compose -f deployment/discovery-connector/docker-compose.yml up -d --build
docker compose -f deployment/website-collector/docker-compose.yml up -d --build
docker compose -f deployment/fact-extraction-gateway/docker-compose.yml up -d --build
docker compose -f deployment/dme-assistant-gateway/docker-compose.yml up -d --build
docker compose -f deployment/report-cleaner-gateway/docker-compose.yml up -d --build
docker compose -f deployment/risk-detector-gateway/docker-compose.yml up -d --build
docker compose -f deployment/n8n/docker-compose.yml up -d
```

Compose services expect external networks referenced in their files; create/use those networks and the Flowise stack before starting them. Start SearXNG and RNE only when their integrations are configured. The application startup script prints the local web URL (normally `http://localhost:3002`); backend default is `http://127.0.0.1:3001`.

## Import n8n and Flowise exports

In n8n, choose **Workflows → Import from File** and import the required `n8n/*.workflow.json` exports. Start with `dme_campaign_orchestrator.workflow.json` and include its referenced planner, discovery, normalization, website enrichment, RNE validation, scoring and offer workflows. Import the assistant/report-cleaner/risk workflows if those features are enabled. Activate workflows that expose production webhooks. Confirm paths in the exports; the campaign endpoint is `POST /webhook/dme/campaign-run`. JavaScript helpers in `n8n/*.js` document/implement node logic and are also part of the integration source.

In Flowise, use **Chatflows/Agentflows → Import** and select the relevant files from `flowise/` and `flowise/agentflows/`. Import the assistant, fact extractor, research planner/query composer, offer recommender, report cleaner and risk detector flows as needed. The gateways reference flow IDs from the Compose configuration; after importing, align those IDs with the generated Flowise IDs if they differ. The main assistant flow ID is configured in `deployment/dme-assistant-gateway/docker-compose.yml`; fact extraction and other flow IDs are configured in their Compose files or workflow exports.

## Actual web API

Base URL is `NEXT_PUBLIC_API_URL` (local template: `http://localhost:3001`). These are NestJS routes from the checked-in controllers. All require the existing access-token authentication unless otherwise noted; use the application's existing API client/session handling. Requests use JSON. `AccessTokenGuard` scopes records to the caller. Prospecting routes also use role authorization: run creation and assignment require `SUPERADMIN` or `MANAGER`; listing, criteria, history, dossier, report and shortlist accept the configured application roles.

| Method and path | Purpose |
| --- | --- |
| `GET /prospecting` | List caller-scoped opportunities. |
| `GET /prospecting/criteria` | Get saved filters. |
| `PATCH /prospecting/criteria` | Save `sector`, `governorate`, `employeeRange` (`10-50`, `50-250`, `250+`) and/or `query`. |
| `GET /prospecting/history` | List caller's runs. |
| `GET /prospecting/runs/:runId` | Read run status/progress. |
| `POST /prospecting/runs` | Start discovery; optional `targetCompanies` 1–50 and `suppliedCompanies` (1–50 entries with `name`, optional `website`, `location`). |
| `GET /prospecting/:companyId/dossier` | Read evidence, scoring and offers in scope. |
| `GET /prospecting/:companyId/report` | Read report view. |
| `POST /prospecting/:companyId/shortlist` / `DELETE /prospecting/:companyId/shortlist` | Add/remove shortlist entry. |
| `POST /prospecting/:companyId/assign` | Assign with `{ "agentId": "<UUID>", "scheduledAt": "<ISO date>" }`; manager/admin only. |
| `POST /ai/companies/:id/assistant` | Ask about an accessible active company: `{ "question": "..." }`, 1–2000 chars. |
| `POST /ai/meetings/:id/clean-report` | Clean an owned meeting's draft report: `{ "text": "..." }`, 1–20000 chars. |

Example (use an access token obtained through the app's normal sign-in flow):

```bash
curl -X POST "$NEXT_PUBLIC_API_URL/prospecting/runs" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"sector":"technology","governorate":"Tunis","employeeRange":"10-50","query":"software","targetCompanies":5}'
```

The response shape is `{ "id": "<run UUID>", "status": "RUNNING|COMPLETED|FAILED", "discoveredCount": 0, "qualifiedCount": 0 }`. For large searches the API returns `RUNNING`; poll `GET /prospecting/runs/:runId`. The backend may return fewer matches than requested.

Assistant request/response shape:

```json
{ "question": "What should I verify before contacting this company?" }
```

```json
{ "answer": "...", "next_action": "...", "key_facts": [], "warnings": [], "model_used": true }
```

Report cleanup takes `{ "text": "visit notes..." }` and returns `{ "executive_summary": "...", "warnings": [], "model_used": true }`. The API service verifies upstream identity/required response fields; errors use standard NestJS HTTP error responses.

## Frontend integration

Prefer the existing `ApiClient` in `applications/dme_frontend-main/lib/api.ts`; it already contains `startProspecting`, criteria/history/list methods, `askCompanyAssistant` and `cleanVisitReport`, with access-token handling. Example:

```ts
const run = await api.startProspecting({
  sector: 'technology',
  governorate: 'Tunis',
  employeeRange: '10-50',
  query: 'software',
});
if (run.status === 'RUNNING') {
  // Refresh api.listProspectingHistory() or poll the run endpoint from the UI.
}

const answer = await api.askCompanyAssistant(companyId, 'Explain the score');
```

Use the API client rather than exposing `AI_*` URLs to the browser. Keep loading/error states for long-running discovery and upstream `502`/`503` responses. The API's Swagger UI is served at `/api/docs`.

## Smoke checks and troubleshooting

After services are up, check their health routes where implemented: `GET http://localhost:8080/health` (discovery), `http://localhost:8082/health` inside Docker / published collector port 8084, and assistant gateway `http://localhost:8085/health`. Check n8n at `http://localhost:5678` and Flowise at its existing host port (Compose setup-dependent). Then sign in to the web app, start a small prospecting run, poll its run ID, open a returned dossier, and call assistant/report cleanup on records the user can access.

- `AI service is not configured`: check backend `.env.local` AI base URLs and restart backend.
- NestJS `502`/timeout: check gateway container health/logs, Compose network connectivity, activated n8n webhook, Flowise flow IDs, and Ollama availability/model (`llama3.2`). Campaign calls allow up to five minutes.
- `SOURCES_UNAVAILABLE`/empty results: check connector and SearXNG health; optional provider credentials/paid search; use a supported location/query. Search snippets remain unverified until later evidence validation.
- `401`/`403`/`404`: use a fresh access token and a company/meeting/run within the caller's role scope; only managers/admins can start runs or assign.
- Compose says external network missing: provision the exact network names referenced by the Compose files and connect the separately managed Flowise/n8n services as required.
- Never paste credentials into logs, workflow exports, browser variables, or issue reports.

## Delivery files and exclusions

The integration file set is the AI controllers/services/modules and prospecting DTO/service/evidence helpers under `applications/dme_backend-main/src/{ai,prospecting}`, the existing frontend API client and integration UI, `services/{discovery-connector,fact-extraction-gateway,website-collector,dme-assistant-gateway,report-cleaner-gateway,risk-detector-gateway,rne-connector}`, corresponding Compose files and safe `.env.example` files under `deployment/`, `n8n/` workflow exports plus JS helpers, `flowise/` flow exports/docs, and this README. Include changed business/API files only when they are part of the intended integration change set.

Do not stage `.env`, `.env.local`, `deployment/application/.local-access.md`, live provider keys, database files, scraper CSVs, `node_modules`, logs, cache directories, backup/`.bak` files, or private demo/rehearsal data. Existing ignored local secrets are excluded by Git; still inspect the staged diff before delivery.
