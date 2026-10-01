# Flowise exports

## Unified Agentflow version

The new [all-in-one Agentflow](all-in-one/README.md) runs campaign orchestration, discovery, RNE, enrichment, scoring, offers, sales assistance, report cleaning and risk assessment inside Flowise without n8n or gateway services. See its guide for examples and current limitations.

This directory contains importable Flowise artifacts built for the same legacy Chatflow node versions found in the supplied project exports.

## Research Planner compatibility adapter

`research_planner_agent Chatflow.json` uses:

- Ollama
- Prompt Template
- Structured Output Parser
- LLM Chain

The supplied Structured Output Parser supports only scalar field types. Nested arrays and objects are therefore returned through these adapter fields:

- `queries_json`
- `stop_conditions_json`
- `warnings_json`
- `query_count`
- `query_limit`

n8n must parse those strings and validate the reconstructed object against:

- `agents/research-planner/output.schema.json`

This scalar adapter is a Flowise-version compatibility detail. It is not the canonical application contract.

## Required Flowise configuration

1. Import the Chatflow JSON.
2. Confirm the Ollama base URL for the deployed environment.
3. Confirm that the selected Ollama model is installed.
4. Keep temperature at `0`, JSON Mode enabled, and streaming disabled.
5. Test the flow with `agents/research-planner/example.input.json` serialized into the `question` input.
6. Do not attach browsing, RNE, database, or memory tools to this flow.

The current model name remains `llama3.2` to match the supplied environment. It must pass the contract tests before production use.

## Structured Fact Extractor

`fact_extractor_agent Chatflow.json` is installed locally as `fact_extractor` with ID `7d3c481a-01ad-49ec-918b-1d7cfcb85a70`. It uses Ollama JSON mode without the scalar Structured Output Parser so it can return nested evidence objects.

The n8n enrichment path calls it through the bounded Fact Extraction Gateway. Semantic extraction is opt-in because the current local `llama3.2` test exceeded the two-minute latency target; deterministic evidence extraction remains active when the model is disabled, slow, or invalid.

## Offer Recommendation Explainer

`offer_recommender_agent Chatflow.json` explains recommendations already selected and validated by n8n. It may not add an offer, change relevance scores, or create commercial claims. This separates natural-language reasoning from product governance and keeps the campaign operational if the local model is unavailable.
