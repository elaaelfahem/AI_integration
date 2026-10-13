# DME API checks

Import `DME_Report_API.postman_collection.json` and `DME_Report_API.postman_environment.json` into Postman. Select `DME Local Report API`, keep the backend running on port `3001`, and run the collection from top to bottom.

The collection authenticates as the seeded manager, selects an existing company and agent, exercises assignments, meetings, tickets, ticket replies, and invalid-login handling, and stores generated IDs automatically. It intentionally creates a validation assignment and meeting and cancels only the assignment as cleanup. Ticket validation data remains available for the detail/history screenshot.

The final folder exercises the four report API surfaces: prospection update, report submission, processed-report retrieval, and PDF export. The report submission keeps the original input and returns a structured deterministic verdict, while export returns a PDF.

For a terminal run with Postman CLI/Newman:

```bash
postman collection run Postman/DME_Report_API.postman_collection.json \
  -e Postman/DME_Report_API.postman_environment.json
```

Do not include the environment file or screenshots containing raw tokens in a public report. Redact access tokens, refresh cookies, invitation links, OTPs, and customer data before adding evidence.
