# Discovery Connector

Internal HTTP adapter used by n8n's DME Discovery Executor.

Supported sources:

- `b2b_tn`: live B2B.tn catalogue, cached for one hour and filtered by sector/location.
- `google_maps`: Google Places Text Search using the existing Maps service API key.
- `web_search`: SearXNG metasearch, running locally without a provider API key.

The service returns immutable raw-source envelopes with URL, retrieval timestamp,
HTTP status, payload, and SHA-256 checksum. It does not normalize or merge entities.

Start it with:

```bash
docker compose up -d --build
```

Health check:

```bash
curl http://localhost:8080/health
```

Import `n8n/dme_discovery_executor.workflow.json` into n8n. Its manual example
uses only B2B.tn and therefore does not incur Google Places charges.

