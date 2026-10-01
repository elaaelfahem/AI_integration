# Report cleaner

The report cleaner converts raw DME visit notes into a structured CRM report while preserving the original report and its SHA-256 checksum. Extracted observations, needs, objections, commitments, and actions carry exact evidence text from the original notes.

Only explicitly mentioned offer families are recorded. Flowise is optional with `enable_ai: true`; invalid or ungrounded model output falls back to deterministic extraction.

Endpoint: `POST /webhook/dme/clean-report`.
