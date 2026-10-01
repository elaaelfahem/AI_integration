# Query Composer

This Flowise component generates one search query per call. n8n owns campaign expansion, limits, aggregation, validation, retries, and stop conditions.

This split is intentional: Flowise 3.1.3's legacy Structured Output Parser supports only scalar fields, so a full query array encoded inside a string cannot be validated reliably.

Import `flowise/query_composer_agent Chatflow.json`, set the Ollama base URL to `http://host.docker.internal:11434`, and keep temperature at `0`.

The n8n node order is:

1. A campaign trigger or webhook.
2. A Code node named exactly `Prepare Query Tasks`, using `n8n/prepare_query_tasks.js` and **Run Once for All Items**.
3. An HTTP Request node that POSTs each item to the Query Composer prediction endpoint.
4. A Code node using `n8n/validate_composed_query.js` and **Run Once for Each Item**.
5. A Code node using `n8n/aggregate_query_plan.js` and **Run Once for All Items**.

The final node returns a normal `queries` array plus `stop_conditions`; no double JSON parsing is needed.
