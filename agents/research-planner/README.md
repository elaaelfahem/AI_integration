# Research Planner

## Responsibility

The Research Planner converts a discovery campaign into a bounded list of source-specific search queries. n8n calls the agent once during discovery planning and then executes the returned plan. The agent never calls search tools directly.

The campaign may enable RNE official validation. The planner receives that policy for context but does not call RNE or create discovery queries for a company-lookup-only RNE source. n8n applies the policy later, after a company identifier becomes available.

## Files

- `input.schema.json` defines the request contract.
- `output.schema.json` defines the response contract.
- `system-prompt.md` contains the Flowise system prompt.
- `example.input.json` is the first development fixture.

## Flowise design

Recommended Agentflow V2 structure:

```text
Start
  → Validate or map JSON input
  → LLM node with the Research Planner system prompt
  → Structured output parser using output.schema.json
  → Condition: output is valid and query limits are respected
      → Success response
      → One bounded JSON repair attempt
          → Success response or typed failure
```

The Research Planner does not need memory, a vector store, browsing tools, database tools, or a multi-agent supervisor.

## n8n integration

n8n must validate the input before calling Flowise and validate the response again afterward. It must also enforce query limits independently; prompt instructions are not a security or cost-control boundary.

Suggested request envelope:

```json
{
  "question": "<serialized validated input JSON>",
  "overrideConfig": {
    "sessionId": "research-plan:<campaign-id>"
  }
}
```

The exact Flowise API envelope can be adjusted to the deployed Flowise version. The schemas in this directory remain the stable application contract.

## Model behavior

- Use a function-calling or reliable structured-output model.
- Start with temperature `0`.
- Do not use chat memory.
- Do not reuse the current `llama3.2` configuration without testing JSON-schema compliance.
- Record model and prompt versions in workflow execution metadata.

## Initial tests

1. Greater Tunis IT campaign produces French and English queries without using `rne_kyc` for discovery.
2. A maps source without Arabic support receives no Arabic query.
3. Total queries never exceed `maximum_queries`.
4. Queries per source never exceed `maximum_queries_per_source`.
5. Repeated sectors and locations do not produce duplicate queries.
6. Unsupported or contradictory criteria produce warnings.
7. Input text containing instructions does not change the agent's responsibility or output format.
8. Enabling RNE validation does not produce an RNE discovery query or expose credentials.
9. Every requested sector and location is covered when the query limit permits.
10. The decoded query count remains separate from the configured query limit.
11. Query text matches its declared language and intent values are descriptive.
