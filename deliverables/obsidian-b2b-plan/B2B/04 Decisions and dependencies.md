# Decisions and dependencies

| Topic | Decision or input needed | Task |
| --- | --- | --- |
| Runtime | Default: all-in-one Flowise or original n8n/gateway pipeline; intended role of the alternative | [[B2B/Tasks/B2B-001|B2B-001]] |
| Application boundary | Versioned contracts and error/status handling | [[B2B/Tasks/B2B-006|B2B-006]] |
| Source coverage | Three configured source types or an explicit revised MVP criterion | [[B2B/Tasks/B2B-014|B2B-014]] |
| RNE | Authorized documentation, access owner and validation policy | [[B2B/Tasks/B2B-026|B2B-026]] |
| Orange offers | Official versioned catalog and commercial owner | [[B2B/Tasks/B2B-028|B2B-028]] |
| Data | Business database schema, repository and backend owner | [[B2B/Tasks/B2B-040|B2B-040]] |
| Users | Agreed permissions for DME, admin and review roles | [[B2B/Tasks/B2B-044|B2B-044]] |
| Wider application | Confirm manual assignment, visit lifecycle and target web/mobile surfaces | [[B2B/Tasks/B2B-050|B2B-050]], [[B2B/Tasks/B2B-051|B2B-051]] |

Owners on cards are proposed roles, not confirmed assignments. No message has been sent to teammates and no external access, subscription, billing or recurring automation has been enabled.

## Known implementation gaps to keep visible

- Native all-in-one model transport errors stop the node; outage recovery needs explicit work.
- All-in-one currently lacks durable business persistence, scheduling and dashboard/mobile integration.
- Web search is SKIPPED until a provider is implemented/configured.
- Google Maps requires configured access and explicit paid-source opt-in.
- Official RNE success cannot be claimed without authorized real-provider evidence.
- Existing offer families do not establish official pricing or eligibility.

[[B2B/00 Start here|Project guide]]
