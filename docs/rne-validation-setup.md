# RNE official validation setup

## Current behavior

The RNE workflow and connector are operational, but the external provider is intentionally unconfigured. No company is presented as officially verified without a real successful registry response.

- No legal identifier: `SKIPPED_NO_IDENTIFIER`
- Identifier available but connector unconfigured: `UNAVAILABLE`
- Provider returns no record: `NOT_FOUND`
- Identifier or company identity conflicts: `CONFLICT`
- Compatible official response: `VERIFIED`

## Information required from the authorized RNE provider

1. API base URL.
2. Company lookup path and supported identifier format.
3. Authentication mode: bearer token, API-key header, or no authentication.
4. API-key header name when applicable.
5. One credential-free example of a successful response and a not-found response.
6. Provider rate limits and retry requirements.

The response examples are needed to confirm the mapping for legal name, registry identifier, legal status, registration date, registered address, activity, and representative.

## Secure configuration

Copy `.env.example` to `.env` and set only non-secret endpoint configuration. Store the API key in a separate file outside the repository, restrict that file to its owner, and set `RNE_API_KEY_FILE_HOST` to its absolute path.

Start the connector with both Compose files:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.rne-enabled.yml \
  up -d --build
```

Never place the key in campaign JSON, workflow exports, Flowise prompts, URLs, screenshots, or this repository.

## Workflow endpoint

`POST http://localhost:5678/webhook/dme/rne-validate`

The main campaign endpoint calls this workflow automatically, so clients normally continue using:

`POST http://localhost:5678/webhook/dme/campaign-run`
