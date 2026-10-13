# Prospection empty-search fix (2026-10-13)

Empty normalized company lists now bypass RNE and enrichment. NO_COMPANIES means a completed search with no matches; SOURCES_UNAVAILABLE means incomplete/unavailable discovery. The backend returns a specific 503 for the latter. The frontend preserves previous results after a failed search and provides French source-outage feedback.

Validation: backend 145 tests, frontend 12 tests, both production builds, empty-campaign regression passed. Local replay of industry / Tunis / 10-50 reached the new source-unavailable outcome instead of crashing at RNE. External discovery availability is still a limitation. Full signed-in browser flow remains unverified.
