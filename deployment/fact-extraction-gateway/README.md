# Fact extraction gateway

Combines guaranteed deterministic contact/identifier extraction with optional Flowise semantic extraction. Flowise calls are bounded by a timeout; invalid, unsupported, or slow model output produces `COMPLETED_FALLBACK` and preserves deterministic facts.

Flowise semantic extraction is opt-in per request until the local model meets the latency target.
