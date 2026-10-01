# Risk detector

The risk detector receives a typed platform event and applies auditable rules for credential exposure, prompt injection, RNE conflicts, unsafe URLs, authentication abuse, connector failures, readiness blocks, and rejected AI output.

Scores map to LOW 0–39, MEDIUM 40–74, and HIGH 75–100. HIGH always produces `BLOCK_AND_REVIEW`. Sensitive credential values are redacted. Flowise can summarize but cannot change detections, score, level, or disposition.

Endpoint: `POST /webhook/dme/detect-risk`.
