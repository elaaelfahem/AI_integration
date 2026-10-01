# DME — All in One (Flowise)

One Agentflow V2 runs the campaign pipeline, sales assistant, report cleaner and risk detector. All orchestration, source adapters, validation and business rules execute inside Flowise. No running n8n instance, gateway service or other Chatflow is required. Ollama remains the local model server; public websites and RNE remain external data sources.

Open the installed flow:
http://localhost:3000/v2/agentcanvas/d4e6f820-0924-4b20-8a10-202609240001

The original workflows remain intact. The generated JSON can also be imported as a new Agentflow V2. Built against the installed Flowise 3.1.3 node definitions. Background campaign scheduling, persistent business storage and dashboard/mobile integration are not included; this version replaces the existing execution pipeline, not the wider application.

## Try it

Open Chat in the canvas and paste a JSON request. Requests are stateless and use one of four operations.

### Campaign

```json
{
  "operation": "campaign",
  "campaign_id": "demo-tunis",
  "sectors": ["software"],
  "governorates": ["Tunis"],
  "enabled_sources": ["b2b_tn"],
  "maximum_candidates": 2,
  "maximum_enrichment_companies": 2,
  "enable_ai": false
}
```

The eight stages are research planning, discovery, normalization, initial RNE validation, website enrichment, final RNE validation, scoring and offer matching. Risk events are assessed for each output company. Zero results and unavailable sources have explicit statuses.

The default executes reliable rules without model calls. With `enable_ai: true`, the Query Composer runs in a native Ollama LLM node. Set `enable_semantic_extraction: true` as well to enable the Fact Extractor; set `enable_semantic_offer_explanation: true` to generate offer explanation drafts. Draft offer prose requires human review; approved offers, scores and commercial fields remain deterministic.

### Sales assistant

```json
{
  "operation": "assistant",
  "company": {
    "company_id": "demo-company",
    "canonical_name": "Example SARL",
    "scoring": {"total_score": 60, "category": "B", "ready_for_offer_recommendation": true},
    "offer_recommendation": {"recommendations": []}
  },
  "user_question": "Prépare ma visite.",
  "enable_ai": false
}
```

Use a complete `companies` record from the campaign in real requests.

### Report cleaner

```json
{
  "operation": "report",
  "company_id": "demo-company",
  "raw_report": "Premier contact. Besoin Office 365. Envoyer une proposition mardi.",
  "enable_ai": false
}
```

### Risk detector

```json
{
  "operation": "risk",
  "event_id": "demo-risk",
  "payload": {"rne_status": "CONFLICT"},
  "enable_ai": false
}
```

## Configuration and limits

- Native LLM nodes use `chatOllama`, `llama3.2`, temperature 0, JSON mode, and `http://host.docker.internal:11434`. Change those nodes for another model server.
- AI output failing schema/grounding checks falls back to deterministic output. **A model connection failure or timeout stops the native LLM node**; rerun with `enable_ai: false`. The older gateway's transport-level fallback is not reproduced by native LLM nodes.
- Flowise Variables supply `RNE_API_BASE_URL`, `RNE_LOOKUP_PATH_TEMPLATE`, `RNE_AUTH_MODE`, `RNE_API_KEY`, and optionally `RNE_API_KEY_HEADER`. Configure these administratively, not in user input. Without access, RNE returns `UNAVAILABLE` or `SKIPPED_NO_IDENTIFIER`, never a fabricated verification.
- Google Maps needs a configured `GOOGLE_MAPS_API_KEY` and explicit `allow_paid_sources: true`. No paid source is enabled by default. Web search reports `SKIPPED` until a provider is implemented.
- The bundled Orange catalog contains offer families and matching rules, not official pricing or eligibility. Recommendations require commercial confirmation.
- Requests are capped at 1 MB, campaigns at 50 candidates, 10 enrichment companies and 10 queries. Website collection is limited to 5 pages per company by default. This local synchronous flow is not a bulk processing service.
- HTTP calls use Flowise's secure axios wrapper. Private-network protection remains enabled. Explicit IPv4 selection works around the pinned-DNS-agent/Node 20 compatibility issue in this installation.
- No business database or automatic writes are added. Flowise keeps its ordinary execution traces; raw reports and inputs can appear there.

## Build and verify

From the project root:

```bash
python3 scripts/build_flowise_all_in_one.py
python3 scripts/install_flowise_all_in_one.py
python3 scripts/test_flowise_all_in_one.py
```

The build script embeds the existing project rules and service functions into the export. Their source files are build-time inputs only. The export is self-contained at runtime. The installer targets this local SQLite installation, backs up the database to `/tmp`, and updates only the dedicated flow ID. `test-runtime.cjs` additionally exercises generated functions in Flowise's actual JavaScript sandbox. `acceptance-results.json` records the latest API acceptance result.

Reference: https://docs.flowiseai.com/using-flowise/agentflowv2
