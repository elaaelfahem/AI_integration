# SearXNG web search

SearXNG provides the `web_search` source used by the Discovery Connector. It runs locally and is reachable only from this computer and the shared Docker network.

Start it:

```bash
docker compose -f deployment/searxng/docker-compose.yml up -d
```

Open the local search interface at http://localhost:8081.

The connector calls `http://searxng:8080/search` with JSON output. Search results are returned as raw-source evidence with the result title, URL, summary, search engines, score, timestamp, and checksum.

No provider API key is required for this setup. Individual upstream engines can still rate-limit or block requests; SearXNG reports those engines as unavailable while continuing with the engines that respond.
