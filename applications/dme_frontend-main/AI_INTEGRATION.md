# DME application + AI integration

The supplied backend and frontend are in `applications/dme_backend-main` and `applications/dme_frontend-main`. They remain separate applications so changes can be copied back into their respective GitHub repositories. No GitHub push or public deployment has been performed.

## Local test

- Website: http://localhost:3002
- Backend and Swagger: http://localhost:3001/api/docs
- Flowise keeps port 3000; n8n keeps port 5678.
- Login details: `deployment/application/.local-access.md` (local-only, ignored by Git).
- Use the manager account to run prospecting or ask questions on a company page or prospect drawer.
- Use the agent account and its test meeting to preview a report summary. Applying a summary changes the draft in the form; the existing Save/Submit actions still control persistence.

The isolated PostgreSQL database is `dme_integration`, on host port 55432. It contains test accounts and live discovery results, not the application's production data.

## Connected flows

1. Browser `POST /prospecting/runs` → authenticated Nest backend → n8n `/webhook/dme/campaign-run` → discovery, qualification, deduplication, RNE checks, website enrichment, scoring and offer recommendations → transactional company and prospect persistence.
2. Browser `POST /ai/companies/:id/assistant` → company authorization → risk check → assistant gateway. The backend loads company context from its database; the browser cannot supply arbitrary company facts.
3. Browser `POST /ai/meetings/:id/clean-report` → assigned-agent and draft checks → risk check → report cleaner → preview. No report is saved automatically.
4. Source collection jobs now call the real pipeline and store actual source references. Unsupported connectors are rejected; no placeholder company is generated.

Managers and administrators can discover companies. Agents can view and ask about companies assigned to them. Imported manager companies remain in that manager's scope. Repeated discovery by the same caller uses a stable source ID and preserves the shortlist/assignment state and manually edited company fields. Cross-user and pre-existing manual-record deduplication is not implemented.

AI context and source IDs are stored in new company columns. Source provenance and review warnings are retained. A completed run means execution finished; it does not mean all companies are qualified or officially verified. Requested sectors are not copied into company records as verified facts.

## Server configuration

Set these only on the backend:

```
AI_N8N_URL=http://127.0.0.1:5678
AI_ASSISTANT_URL=http://127.0.0.1:8085
AI_REPORT_CLEANER_URL=http://127.0.0.1:8086
AI_RISK_URL=http://127.0.0.1:8087
AI_ENABLE_MODEL=true
```

The local configuration enables the verified Ollama path in the assistant and report gateways. A model timeout or invalid output returns a clearly labelled rules-based fallback. Discovery, scoring, offer recommendations and risk rules remain deterministic in the bounded application campaign; semantic website extraction and offer explanation are disabled.

The browser uses `NEXT_PUBLIC_API_URL=http://localhost:3001`. CORS allows the local frontend on port 3002. No AI URLs, credentials, or database secrets are included in frontend configuration. For deployment, use the appropriate backend service hostname instead of localhost and configure HTTPS, CORS, and your gateway authentication. The backend now defaults to `HOST=127.0.0.1`; container deployments should explicitly set `HOST=0.0.0.0` behind their intended network boundary.

## Start again

The local app now runs in persistent user services. Start or stop it from this repository root:

```
bash scripts/start-application-local.sh
bash scripts/stop-application-local.sh
```

These scripts manage only `dme-b2b-local-backend` and `dme-b2b-local-frontend`. They do not start at machine boot. To load new builds, restart the two units with `systemctl --user restart dme-b2b-local-backend dme-b2b-local-frontend`. Logs are available with `journalctl --user -u dme-b2b-local-backend -u dme-b2b-local-frontend`.

The manual commands below are an alternative; do not start a second copy on the same ports.

From the AI repository root:

```
docker compose -f deployment/application/docker-compose.yml up -d
docker compose -f deployment/dme-assistant-gateway/docker-compose.yml up -d
docker compose -f deployment/report-cleaner-gateway/docker-compose.yml up -d
docker compose -f deployment/risk-detector-gateway/docker-compose.yml up -d
```

The existing n8n, Flowise, discovery, collector, extraction, RNE and SearXNG services must also be running with their imported workflows.

Backend terminal:

```
cd applications/dme_backend-main
npm ci --ignore-scripts
npx prisma generate
npm run build
npm run start:prod
```

Frontend terminal:

```
cd applications/dme_frontend-main
npm ci --ignore-scripts
npm run build
npm run start -- --port 3002 --hostname 127.0.0.1
```

For a new **empty local** database, point `.env.local` at it, run `npx prisma migrate deploy`, then `node scripts/seed-local.cjs` (the seed is restricted to local `dme_integration`). Do not run a reset against an existing application database.

## Database migrations

The omitted ticket-table prerequisite is restored in `20260927120200_create_tickets`; the additional missing schema fields are restored in `20261013130000_restore_schema_fields`. All 28 migrations were applied to a separate empty PostgreSQL database, followed by a Prisma schema diff with no differences.

For a new empty database, use `npx prisma migrate deploy`. Existing databases previously created with `db push` or manually applied SQL need their migration history reconciled against their actual schema before deployment: do not blindly apply CREATE statements to existing objects, mark migrations applied without verifying their contents, or reset existing data. The local application's existing `dme_integration` data was preserved; migration verification used `dme_migration_check_20261013`.

## Verification

Updated checks on 13 October 2026:

- Backend build passed; 23 suites / 150 tests passed.
- Frontend build passed; 12 tests passed.
- Full AI workflow acceptance: 12 checks passed (see `deliverables/application-integration/full-system-check.json`).
- Live application campaign saved five companies; source collection saved five source references; report preview and actor-scope checks passed.
- Authorized manager browser login, dashboard, eight prospects, assistant response, history, company records, calendar, report list and ticket list were verified.
- The directory provider briefly failed during revalidation. Discovery now reports B2B.tn/Maps transport failures as `SKIPPED`, allowing other sources to continue. The local regression test covers HTTP errors, malformed data and offline directory behavior.

- Backend: `npm test -- --runInBand`.
- Frontend: `npm test` and `npm run build`.
- Backend scripts: `node scripts/check-live-ai.cjs`, `node scripts/check-report-ai.cjs`, `node scripts/check-collection-ai.cjs` (local integration database only; they add test runs and results).
- Browser check: manager login → dashboard count → prospecting results → assistant preview.

## Remaining limits

- RNE credentials are still absent, so official registry verification is unavailable.
- Collection supports connector references `b2b_tn`, `web_search`, and `google_maps`; Maps requires its existing API credentials and may incur provider charges. Other source catalogue entries are not implemented.
- Interactive campaigns are capped at five companies and one query per source. They are synchronous, with a five-minute upstream timeout and a longer browser timeout. For public deployment, move campaign execution to a durable queue with polling and idempotency. Campaigns and collection jobs older than ten minutes are marked failed at startup and every minute so they can be relaunched. They are not automatically replayed; durable queues remain a production-scale improvement.
- Local assistant and report gateways use schema-constrained Ollama generation (`OLLAMA_URL`, `OLLAMA_MODEL=llama3.2`) when AI_ENABLE_MODEL=true. Live calls returned model_used=true in approximately 10 and 5 seconds. IDs, scores and review decisions stay application-owned; report evidence is copied from exact source sentences. Model failures fall back explicitly to rules. Review-blocked companies do not call the model.
- Search sector aliases cover tech/informatique, industry/industrie and health/santé. Web search uses a bounded 15-minute exact-query cache on failure, preserving evidence timestamps, and a one-minute provider cooldown. Uncached searches still depend on external availability; CAPTCHA and rate limits are not bypassed.
- SMTP and Firebase push are not configured for the isolated test environment. These integrations were not verified by this work.

## Local model setup

The gateway Compose files use the already-installed Ollama through `host.docker.internal:11434`. On Linux, the host must expose Ollama to the Docker bridge (the existing local proxy does this); do not expose it publicly. The installed model must match OLLAMA_MODEL. Legacy Flowise transport remains available by omitting OLLAMA_URL. Generation has a 65-second deadline; the frontend exposes rules mode when fallback is used.

Additional regression commands: `node scripts/test_local_models.mjs`, `node scripts/test_search_cache.mjs`, `node scripts/test_web_search.mjs`, `node scripts/test_empty_campaign.js`.
