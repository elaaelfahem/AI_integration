# Orange Business Tunisia — B2B project

Open **CardBoard → B2B** for the working Kanban board. Task files live in `B2B/Tasks`; CardBoard reads their Markdown checkboxes and status tags.

## Start here

1. [[B2B/Tasks/B2B-001|Choose the main architecture]]. The newer all-in-one Flowise implementation differs from the original n8n/gateway design.
2. [[B2B/Tasks/B2B-002|Record the local runtime]] and then [[B2B/Tasks/B2B-003|restore the selected services]].
3. [[B2B/Tasks/B2B-004|Make the test harness portable]], [[B2B/Tasks/B2B-005|prepare fixtures]] and [[B2B/Tasks/B2B-006|agree the application contract]].
4. Verify one small campaign before expanding sources or connecting the full application.

## How to use the board

| Column | Meaning |
| --- | --- |
| Backlog | Planned work; check linked prerequisites before starting. |
| Ready | A small task can be started now. |
| In Progress | Actively being worked on. Keep at most two here. |
| Testing | Related implementation exists; its specific acceptance test still needs verification. Check prerequisites first. |
| Blocked | Waiting for an outside dependency; the reason is in the task note. |
| Done | The card's own completion test passed and evidence is recorded. This does not imply the whole feature is production-ready. |

Drag cards between the status columns. Keep exactly one `#b2b/...` status tag on each unfinished task. To finish, record evidence and check the task checkbox; CardBoard places completed tasks in Done. If a regression occurs, uncheck it and give it the appropriate unfinished status tag. Do not edit a second status field: the task checkbox and tag are the source of truth.

Click a card's source note to see its work, proposed owner, dependencies, test and evidence record. Effort values are rough focus-time estimates, not deadlines; split a card if it exceeds half a day. No dates or assignments have been committed to teammates.

If the current CardBoard tab still looks empty after this setup, toggle **CardBoard** off and on in Settings → Community plugins, or restart Obsidian, then open the B2B board. Its installed version reads settings at plugin startup. The Obsidian CLI is disabled, so the board has not been visually verified in the running app.

## Scope and ownership

Your confirmed area is AI architecture, Flowise agents, workflow orchestration, connectors, validation, fallbacks and testing. Shared backend, web/mobile, security and deployment cards are proposed integration work for the wider team. Manual assignment and visit lifecycle are explicit scope-decision cards because this repository does not define the complete wider application.

The newer `flowise/all-in-one/README.md` describes a stateless synchronous prototype without business persistence, scheduling or web/mobile integration. The earlier discovery specification describes the broader target. The board includes both verification of existing work and small additions needed toward that target; it does not assume all design text is already implemented.

Automatic company contact and automatic prospect assignment are outside the documented MVP. Model prose never determines official identity, final scores or approved commercial facts.

## Definition of done

A card is complete when its stated output exists, its relevant happy-path and failure checks pass, evidence is linked with a date, and known limitations are recorded. For team decisions or access dependencies, completion means the decision/material actually exists. For live integration, a mocked pass does not count as a live pass.

Only four existing offline regression cards were completed during setup. Other implementations remain unverified until their own checks are run. Historical acceptance artifacts are useful context, not current proof.

## Navigation

- [[B2B/01 Test baseline|Current tests and runtime observations]]
- [[B2B/02 Roadmap|All 60 tasks grouped by phase]]
- [[B2B/03 Test protocol|How to test each task]]
- [[B2B/04 Decisions and dependencies|Open architecture and team decisions]]
