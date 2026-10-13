# Terminal validation result

Run date: 2026-10-04

The launcher restarted the backend, frontend, and Mailpit successfully. The backend health check passed with HTTP 200 and `{"status":"ok","database":"ok"}`.

The seeded manager login and authenticated smoke checks passed. Manager-scoped companies, agents, assignments, meetings, prospecting, history, and dashboard requests returned successfully. The manager was correctly denied access to the superadmin-only data-source catalogue. Invalid UUID and invalid scheduling requests returned validation errors.

The report-required endpoint probes passed against the current implementation:

| Request | Result |
| --- | ---: |
| `POST /prospections/:id/update` | 201 |
| `POST /reports/:id` | 201 |
| `GET /reports/:id` | 200 |
| `GET /reports/:id/export` | 200 (`application/pdf`) |

The report submission returned a structured verdict and preserved the original payload. The export returned a PDF, and an unauthenticated retrieval attempt returned 401. The temporary assignment used for this validation was removed afterward.
