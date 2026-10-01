# DME Structured Fact Extractor

This Flowise flow structures text already collected from an official company website. It does not browse and does not decide whether a claim should overwrite an existing company field.

The model runs in JSON mode without the scalar Structured Output Parser because facts are nested evidence objects. n8n parses the raw JSON and rejects facts without a matching source URL and evidence substring.
