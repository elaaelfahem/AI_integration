# Lead scoring

The `DME Lead Scoring - Deterministic and Explainable` n8n workflow receives the final company records after RNE validation and produces a stable 0–100 score.

## Why the score is deterministic

Sales prioritization must be reproducible and auditable. The LLM may later explain the evidence in natural language, but it must not alter the score, category, or readiness gate.

## Components

- Campaign fit: 30 points
- Telecom opportunity: 25 points
- Reachability: 20 points
- Official trust: 15 points
- Evidence quality: 10 points

Categories are `A` (75–100), `B` (50–74), `C` (0–49), and `REVIEW`. An RNE conflict or `ready_for_scoring: false` always forces `REVIEW` and prevents offer recommendation.

Endpoint: `POST /webhook/dme/score-companies`.
