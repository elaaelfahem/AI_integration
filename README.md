# DME B2B Prospecting Workflows

This project implements and validates a B2B prospecting system for Tunisia. It supports campaign planning, company discovery, normalization, registry checks, website enrichment, company scoring, offer recommendations, sales assistance, report cleaning, and risk detection.

## Tested implementations

### n8n workflows

Importable workflow definitions are in [`n8n/`](n8n/). The tested workflow set includes:

- Research Planner and Query Composer
- Discovery Executor, including B2B.tn and local SearXNG search
- Candidate Normalization and Deduplication
- Company Scoring and Offer Recommendations
- DME Sales Assistant, Report Cleaner, and Risk Detector
- Full Campaign Orchestrator

The RNE validation workflow is included, but live official verification requires a valid RNE API key. Without one, the system returns a review-required result rather than claiming a verification.

### Flowise workflows

Importable Flowise Chatflows are in [`flowise/`](flowise/), the unified Flowise-only Agentflow export is in [`flowise/all-in-one/`](flowise/all-in-one/), and separately tested Agentflows are in [`flowise/agentflows/`](flowise/agentflows/).

The separate Flowise-only Research Planner and Discovery Executor were tested live. The Discovery Executor performs direct B2B.tn retrieval; it does not call n8n. Invalid campaign input returns a structured `REJECTED` result and stops before research or discovery.

## Evidence and setup

- Workflow test evidence: [`deliverables/workflow-checks/`](deliverables/workflow-checks/)
- Agent contracts and prompts: [`agents/`](agents/)
- Service implementations: [`services/`](services/)
- Docker deployment guides: [`deployment/`](deployment/)
- Technical documentation: [`docs/`](docs/)

## Run locally

Each deployable component has a Docker Compose file and a README under [`deployment/`](deployment/). Start only the services required by the workflow you want to test. Copy any `.env.example` file to `.env` and provide your own credentials; local secrets and generated database files are excluded from Git.

## Workflow status

| Workflow | Status |
| --- | --- |
| Research planner and query composer | Tested |
| Discovery executor | Tested |
| Candidate normalization and deduplication | Tested |
| RNE validation | Requires RNE API key for live verification |
| Website enrichment and fact extraction | Core path tested; semantic model path is optional |
| Company scoring | Tested |
| Offer recommendations | Tested |
| DME sales assistant | Tested |
| Report cleaner | Tested |
| Risk detector | Tested |
| Full campaign orchestrator | Tested |
| Flowise-only research planner | Tested |
| Flowise-only discovery executor | Tested |
