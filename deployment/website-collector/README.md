# Website collector

Collects a bounded set of public, same-domain website pages for structured enrichment. It blocks private-network destinations and cross-domain redirects, caps response sizes and timeouts, checks basic `robots.txt` exclusions, strips executable HTML, and returns source URLs and checksums with the extracted text.

Endpoint: `POST /v1/collect` on the Docker network at `http://website-collector:8082`.
