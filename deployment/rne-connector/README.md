# RNE connector

This local adapter keeps the RNE credential and provider-specific HTTP details out of n8n workflow exports and Flowise prompts.

It starts safely without credentials. In that state `/health` reports `configured: false`, records without an identifier return `SKIPPED_NO_IDENTIFIER`, and records with an identifier return `UNAVAILABLE` without making an external request.

To enable a real provider, set `RNE_API_BASE_URL`, `RNE_LOOKUP_PATH_TEMPLATE`, and `RNE_AUTH_MODE`, then use `docker-compose.rne-enabled.yml.example` as the template for mounting the API key as the read-only file `/run/secrets/rne_api_key`. Confirm the actual response field names against the authorized RNE API documentation before production use.
