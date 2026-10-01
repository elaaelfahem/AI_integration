# Local n8n for the B2B DME project

This deployment runs n8n on `http://localhost:5678`, persists its state in the
`b2b_n8n_data` Docker volume, and joins Flowise's existing `docker_default`
network. Inside n8n, Flowise is reachable as `http://flowise:3000`.

## Start

```bash
docker compose up -d
docker compose ps
```

Open `http://localhost:5678` and create the local owner account when prompted.

## Import and configure the research workflow

1. Import `flowise/query_composer_agent Chatflow.json` into Flowise.
2. The workflow is currently configured for Query Composer chatflow ID
   `59650638-53f6-4339-bbfa-6d21be5fbf5a`.
3. In n8n, import `n8n/dme_research_planner.workflow.json`.
4. If the Query Composer is re-imported in the future and receives a new ID,
   update the URL in the `Call Flowise Query Composer` node.
5. Save and run the workflow manually. The included example campaign should
   produce sixteen queries: two sectors across four Greater Tunis governorates,
   in both French and English.
6. When the manual test succeeds, publish the workflow to enable its POST
   webhook at `/webhook/dme/research-plan`.

The n8n HTTP node processes every incoming query-task item automatically. The
workflow validates model-controlled fields before aggregating the final plan.

## Operations

```bash
docker compose logs -f n8n
docker compose stop
docker compose start
docker compose pull
docker compose up -d
```

Do not delete the `b2b_n8n_data` volume unless you intentionally want to remove
the local n8n database, credentials, encryption state, and workflows.

## Campaign form

Open http://localhost:5678/form/8ed66a1c-acbb-4dcc-82ea-ca951ca50194
with local n8n running and the workflow published. Enter a campaign name,
comma-separated sectors and governorates, optional keywords and a candidate limit
from 1 to 200 (default 200). This prepares searches; it does not collect companies.
Inspect Aggregate Query Plan in the completed execution for results.

The form configuration is in `config/research_campaign_form.json`; conversion and
validation are in `n8n/build_campaign_from_form.js`. The research workflow generator
includes the form branch. Manual and webhook entry points remain available.
