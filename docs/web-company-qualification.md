# Qualification of web-search company candidates

The Candidate Normalizer now calls the Discovery Connector's
`POST /v1/qualify-discovery` before normalization. Google Maps and B2B.tn records
pass through unchanged. Only `web_search` records require this qualification.

Search results are not assumed to be companies. Known directories, social/job
platforms, documents, company lists, and editorial/listing paths are rejected.
For other URLs the existing Website Collector checks one page, respecting its
URL/network, redirect, content-type, size, timeout, and robots checks.

A result is accepted only when its page has:

- A business/organization name from JSON-LD or page title sharing a non-generic
  brand token with the domain.
- Business-activity wording.
- A published email or phone link.

This is a conservative heuristic for first-party business sites, not independent
proof of domain ownership or RNE/legal verification. Its website status is
`SUPPORTED_BY_SITE_EVIDENCE`. A blocked/unavailable page, ambiguous identity,
missing business/contact evidence, or exceeded limit remains `REVIEW_REQUIRED`.
No official URL is invented for a directory record.

Raw envelopes and checksums are unchanged. `web_qualifications` records the
decision, source record ID, company name, website and evidence URL, timestamp,
checksum, contact links, and method version. The normalizer keeps rejected and
unresolved hits in `excluded_candidates`; only accepted web hits become company
records. Qualified companies retain their evidence in `web_qualifications`.

Counts obey:

```
raw_candidate_count = unique_company_count + duplicates_merged + excluded_candidate_count
```

`review_required_count` continues to count ambiguous company matches;
`excluded_candidates` contains unresolved search hits separately. Either kind of
review makes normalization `REVIEW_REQUIRED`. Companies from other sources
continue through the existing deduplication rules.

At most 12 sites are checked per request, using 3 workers, one page per site and
a 35-second collector request timeout. Remaining hits are held for review.
Set `WEBSITE_COLLECTOR_URL` on the Discovery Connector to override the Docker
default `http://website-collector:8082`. The collector must be running for web
qualification; no website call is made for non-web records or rejected hits.

## Verification

From the repository root:

```bash
node scripts/test_candidate_normalizer.js
node scripts/test_web_qualification.mjs
node scripts/test_web_search.mjs
```

Regenerate the importable normalizer with
`python3 scripts/build_n8n_candidate_normalizer_workflow.py`. To update a live
workflow, export it first and preserve unrelated user changes. The deployment
for this task modified only the normalizer, validator, and qualification routing,
then published that workflow and restarted n8n. Backups are in the task's work
folder. Existing Maps and B2B.tn discovery code was not changed.

Remaining coverage limitations: a legitimate company without readable contact
links, with a different domain/brand spelling, or behind browser protection is
held for review. Directory-to-company lookup and independently proving ownership
are not implemented. Sites requiring JavaScript may not be readable by the
collector. These conservative exclusions are intentional and remain inspectable.

## Cross-source checks and contact validation

Accepted sites are now cross-checked against existing Google Maps/B2B.tn records
using both company brand and exact website host. If no match exists in the input,
the connector may make one targeted Google Places lookup (up to three results,
three-second timeout) per accepted web company when the existing Maps key is
configured. These calls can incur the usual Places charges. Matching evidence is
saved in `corroboration`; status becomes `CORROBORATED_BY_DISCOVERY_SOURCE`.
Absent a match, the supported-site status remains unchanged. In either case,
`ownership_verified` remains false: corroboration is not proof of legal ownership.

The Fact Extraction Gateway now uses pinned `libphonenumber-js` country metadata
for whole-number validation. It does not split foreign numbers into Tunisian
fragments. Unlabelled local numeric IDs are not accepted as phones. Emails are
normalized and syntax-checked, and duplicates are removed. Model-generated
phone/email facts cannot bypass the deterministic contact path. Contacts carry
`FORMAT_VALID` and `reachability_verified: false`; no calls or messages are sent.

RNE results explicitly include `provider_configured` and `registry_verified`.
Missing identifiers warn that verification did not occur, and unavailable access
is reported without inventing a provider. Existing validation-policy behavior is
preserved. Authorized RNE API access is still required for actual registry checks.
