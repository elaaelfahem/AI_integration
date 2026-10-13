# SearXNG web search

SearXNG provides the `web_search` source used by the Discovery Connector. It runs locally and is reachable only from this computer and the shared Docker network.

Start it:

```bash
docker compose -f deployment/searxng/docker-compose.yml up -d
```

Open the local search interface at http://localhost:8088.

The connector calls `http://searxng:8080/search` with JSON output. Search results are returned as raw-source evidence with the result title, URL, summary, search engines, score, timestamp, and checksum.

No provider API key is required for this setup. Individual upstream engines can still rate-limit or block requests; SearXNG reports those engines as unavailable while continuing with the engines that respond.

## Reproducible local setup

The image is pinned to the digest verified on 2026-10-08. Port **8088** is
reserved for the host-facing search UI/API; RNE uses host port 8081. Containers
continue to use `http://searxng:8080` on the external `docker_default` network.
The n8n workflow calls `http://discovery-connector:8080/v1/discover` on that same
network. Do not use `localhost:8088` from inside the connector container.

For a fresh installation, create the network if it does not already exist and
create a private `.env` in this directory containing `SEARXNG_SECRET=<random
secret>`. Generate a secret with `openssl rand -hex 32`; do not commit it. The
SearXNG environment variable overrides `server.secret_key`. JSON is enabled in
`settings.yml` under `search.formats`.

Start SearXNG using the command above. Start/rebuild the discovery connector
using `deployment/discovery-connector/docker-compose.yml`, keeping
`DISCOVERY_ENV_FILE` set to the existing Maps credentials file. Start n8n using
`deployment/n8n/docker-compose.yml`. Existing active workflows do not need to
be reimported for this provider update.

Verify the API:

```bash
curl --get 'http://localhost:8088/search' \
  --data-urlencode 'q=entreprises informatique Tunis' \
  --data 'format=json'
node scripts/test_web_search.mjs
```

Run the Node test from the repository root. It uses a local mock upstream and
checks the HTTP provider contract without consuming Google Places requests.

The connector preserves usable results and includes upstream engine failures in
`warnings`. Invalid JSON/schema, HTTP errors, unusable result URLs, or an empty
response accompanied by engine failures yield `SKIPPED` with a reason. A valid
empty response without reported engine failures remains `COMPLETED` with zero
candidates. The existing n8n response contract supports `COMPLETED`/`SKIPPED`;
no new status values are introduced.
