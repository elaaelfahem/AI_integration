# Separately tested Flowise Agentflows

Import these JSON files in **Flowise → Agentflows → Add New → Import**.

- `DME_Research_Planner_and_Query_Composer_Agentflow.json`: turns a campaign request into a validated research plan and search queries.
- `DME_Discovery_Executor_Flowise_Only_Agentflow.json`: validates a campaign, produces its queries, and retrieves raw company evidence directly from B2B.tn. It does not call n8n.

Both flows were checked with a normal campaign and an invalid request. The discovery flow returns a structured `REJECTED` result for invalid input and stops before any retrieval.
