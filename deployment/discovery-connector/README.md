# Discovery Connector

Internal HTTP adapter used by the existing n8n discovery and company research workflows.

- `web_search`: Serper organic web search when `SERPER_API_KEY` is configured; otherwise local SearXNG. Authentication failures and rate limits return explicit incomplete status. Recent exact-query fallback retains original timestamps and warnings.
- `user_supplied`: independently supplied company identities/websites.
- `google_maps`: place IDs only; raw Places names/addresses do not enter persistence.
- `b2b_tn`, `google_maps_scraper`, `openstreetmap`: disabled in V1 pending provider review.

Put `SERPER_API_KEY=<your key>` in the existing private discovery environment file, with mode 0600 and ownership readable by container UID 1000. Do not commit the file. The key is sent only in the header to `https://google.serper.dev/search`; redirects are rejected. Only organic results are ingested, never Maps/Places results. Each search request uses the configured provider account's quota.

Preserve the existing secret mount and named cache volume on deployment:

```bash
DISCOVERY_ENV_FILE=/absolute/path/to/existing/discovery_service/.env \
  docker compose -f deployment/discovery-connector/docker-compose.yml up -d --build
```

Omitting `DISCOVERY_ENV_FILE` mounts `/dev/null` and loses configured provider access. `scripts/start-application-local.sh` preserves the existing mount when the container exists. SearXNG needs to be running only when it is the selected provider.

`GET http://localhost:8080/health` reports the selected search provider without exposing keys. Source envelopes preserve URL, retrieval timestamp, HTTP status, provider, and SHA-256 payload checksum. Search snippets are unverified evidence; company qualification, identity checks and website extraction remain mandatory downstream.
