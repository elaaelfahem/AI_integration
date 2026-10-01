# Testing one task at a time

1. Open the task note, check prerequisites and select one measurable outcome.
2. Move the task to In Progress. Use synthetic inputs and fixtures first.
3. Implement or inspect the smallest relevant change. Move to Testing when ready to verify.
4. Run the card's acceptance scenario and the relevant failure case. Use the selected architecture's harness; an offline n8n pass does not replace Flowise runtime acceptance.
5. Record: date, code/export version, command or UI steps, input fixture, expected result, actual result, and a redacted evidence file/link.
6. Mark Done only after that card's criteria pass. If blocked, move it to Blocked and name the missing dependency; if it fails, keep it open and record the failure.

## Evidence template

```text
Checked at:
Runtime / code or export version:
Command or UI steps:
Fixture / input:
Expected:
Actual:
PASS / FAIL / BLOCKED:
Evidence path:
Known limits:
```

## Useful existing test entry points

- Offline rules: `scripts/test_candidate_normalizer.js`, `scripts/test_rne_validation.js`, `scripts/test_company_scoring.js`, `scripts/test_offer_recommender.js`.
- Original n8n/gateway integration: `scripts/test_full_system.mjs` (needs the old services; makes a bounded live campaign).
- All-in-one Flowise API: `scripts/test_flowise_all_in_one.py` (needs the installed flow and model; performs live calls and rewrites its acceptance-results file).
- Flowise sandbox: `flowise/all-in-one/test-runtime.cjs` (needs path repair first; `--live` additionally makes external calls).

Read prerequisites before running live scripts. Preserve the prior acceptance artifact before replacing it. Separate fixture results, live provider results and business acceptance. Do not count historical results as a fresh pass.

[[B2B/00 Start here|Project guide]]
