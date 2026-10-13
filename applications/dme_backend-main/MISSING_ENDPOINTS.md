# Backend Gap Register — B2B App (Figma vs. current API)

> Status checked 2026-10-07. Everything below is implemented except the AI chatbot and the AI score explanation (Part A §5, §8), which need an AI service. The mobile endpoints are listed in `MOBILE_API.md`.
>
> Earlier status (2026-10-04): The prospecting workflow, data-source management, role-scoped dashboard, ticket workflow, assignment scheduling, and persisted field-report/PDF workflow listed below are implemented in the current branch. The unchecked items that remain are product capabilities outside those delivered workflows, primarily mobile-only features and monthly reporting extensions.

Gap analysis between the Figma design (`B2B`, file `fbkK92IE0pjxjRLqAKAXas`) and the current NestJS/Prisma backend in `src/`. Covers two canvases:

- Node `20:86` — **Mobile** app (Auth, Calendar, Entreprises, Rapports, Home, Chatbot, Mon profil) — see part A
- Node `0:1` — **Web** app (Tableau de bord, Gestion des utilisateurs, Assignation, Prospection IA, Rapports, Planifier une visite, profile setting) — accessible by all roles including agents, with views/actions scoped per-role — see part B

Screens that are already fully covered (login/OTP/2FA, password reset, company CRUD, user CRUD, visit assignments, invitations) are not listed below. Only gaps are.

**⚠️ Naming note — "Rapports" means two different things in the Figma, and this doc (and the code) now disambiguates them:**

- **Visit reports** (mobile, §3): the record of what happened during a company visit — outcome, needs identified, proposed solutions, attachments. Now built as its own `VisitReport` model (see §3), reachable from `/visit-reports` in the frontend (sidebar label "Rapports"), separate from `ProspectingMeeting` itself.
- **Tickets** (web, §9): an internal issue tracker unrelated to visits — "Problème technique", "Problème avec une entreprise", etc. The Figma screen itself is labeled "Rapports" but it is a **support-ticket system**, not a report. Implemented as the `Ticket` model / `tickets` module in the backend, and the `/tickets` route (sidebar label "Tickets") in the frontend — deliberately not named "reports" anywhere in code to avoid colliding with the visit-reports feature above.

# Part A — Mobile app

The mobile app is agent-only (no manager/superadmin usage) — all endpoints below are scoped to the calling agent's own data (their visits, their assigned companies, their notifications), not role-branching like the web endpoints in Part B.

## 1. Notifications — implemented

The Home screen ("Accueil") has a notification list, per-item delete with a swipe action, and a "Are you sure" delete-confirmation dialog. Every platform event creates a notification (35 types, catalog in `NOTIFICATIONS.md`), including the reminders the Figma screen shows: "Visite imminente", "Rappel" and the per-visit "Recevez un rappel 1 jour avant la visite" switch (`reminderEnabled`). Notifications carry `entityType` + `entityId` so the app opens the exact item.

- [x] `Notification` Prisma model: `notifications` (id, account_id, type, title, body, link, read_at, created_at). `link` is the in-app path to open; the mobile app maps it to a screen.
- [x] `GET /notifications`: list current user's notifications, cursor pagination, filters `q`, `status` (all/unread/read), `category`. Also `GET /notifications/unread-count`.
- [x] `PATCH /notifications/:id/read`: mark as read. Also `POST /notifications/read` (selected ids) and `POST /notifications/read-all`.
- [x] `DELETE /notifications/:id`: delete a notification (backs the "Supprimer"/confirm-dialog flow). Also `POST /notifications/delete` (selected ids) and `POST /notifications/delete-read`.
- [x] `DeviceToken` model + `POST /notifications/devices` / `POST /notifications/devices/unregister`: register the app's Firebase token (`platform: ANDROID|IOS|WEB`) after login, remove it on logout.
- [x] Push sending through Firebase Cloud Messaging: every notification is pushed to the account's devices. Flutter guide: `MOBILE_NOTIFICATIONS.md`.

## 2. Dashboard / KPIs — implemented

The "Accueil" dashboard shows a `kpi-grid` with tiles: Visites planifiées, Visites total, Entreprises assignées, and one more. Nothing currently aggregates this for the logged-in agent/manager (the existing `/users/summary` is for admin user-management counts, not an agent's own dashboard).

- [x] `GET /me/dashboard` (agent only): KPIs `plannedVisits`, `totalVisits`, `assignedCompanies`, `reportsToComplete`, plus `nextVisit`, the 5 next open assignments ("Mes assignations") and the unread notification count. Meetings and assignments are merged, a visit stored in both is counted once.

## 3. Visit reports ("Rapports", mobile) — model too thin

Not to be confused with the web "Rapports" screen in §9, which is actually a support-ticket system (`Ticket` model) — this section is about the report of what happened during a visit.

`ProspectingMeeting` still only has `outcome` and `completion_notes` itself, but the richer report data now lives on a separate `VisitReport` model (1:1 with a meeting), matching the Figma "Rapports de prospection" flow (list, filters, detail, "Rapports modification"):

- [x] `VisitReport` model — **identified needs** (`needs: VisitReportNeed[]` — CONNECTIVITY/CLOUD/SECURITY/SD_WAN/OTHER), **proposed Orange solutions** (`solutions: VisitReportSolution[]` — ORANGE_BUSINESS_VPN/FLEXIBLE_ENGINE_CLOUD/ORANGE_CYBERDEFENSE/OTHER), **client interest level** (`interest_level` — LOW/MEDIUM/HIGH), free-text **compte rendu** (`summary`), plus a **status** lifecycle (DRAFT → SUBMITTED → IN_REVIEW → VALIDATED) and `outcome_result` (INTERESTED/TO_FOLLOW_UP/NEGOTIATION/OPPORTUNITY_WON/OPPORTUNITY_LOST/NOT_INTERESTED) not in the original ask. `prisma/schema.prisma`.
- [x] `VisitReportAttachment` model + file storage — `Bytes` in Postgres (same pattern as ticket attachments), 5MB cap.
- [x] `POST /meetings/:id/attachments` — built as `POST /visit-reports/by-meeting/:meetingId/attachments` (multipart, one file per call).
- [x] `GET /meetings/:id/attachments/:attachmentId` — built as `GET /visit-reports/by-meeting/:meetingId/attachments/:attachmentId`.
- [x] `DELETE /meetings/:id/attachments/:attachmentId` — built as `DELETE /visit-reports/by-meeting/:meetingId/attachments/:attachmentId` (draft-only).
- [x] Free-text notes log — `VisitReportNote` model (append-only, separate from `summary`), `POST /visit-reports/by-meeting/:meetingId/notes` and `DELETE .../notes/:noteId` (own notes only). Not gated to DRAFT status like the rest of the report, so an agent can jot notes any time after the visit is `COMPLETED`; auto-creates the `VisitReport` row on the first note if none exists yet. Frontend: a notes list + add-note field in the agent's report drawer (saves on Enter, on blur, or via button — "auto-save" per note rather than a continuously-typed single field) and a read-only notes list in the manager/admin detail view.
- [x] `GET /companies/:id/reports` — built as-speced, mounted under `/companies` (`CompanyVisitReportsController`), role-scoped the same as the main `GET /visit-reports` list.

Also built, beyond the original ask: `GET /visit-reports` (role-scoped list — agents see their own, managers their team, superadmins all), `GET /visit-reports/stats`, `POST .../submit`, `POST .../review` (manager/superadmin moves DRAFT→SUBMITTED reports to IN_REVIEW/VALIDATED). Frontend: agent-facing report drawer opened from a completed visit's popover in `/meetings`, plus a `/visit-reports` list+detail page for all three roles (agents see only their own, read-only; managers/superadmins get review actions), reachable via the sidebar "Rapports" entry.

## 4. Visit notes scan / OCR — implemented

The Calendar flow has "Nouvelle visite - Scan" / "Scanner mes notes" — scanning handwritten notes during/after a visit.

- [x] `POST /visit-reports/by-meeting/:meetingId/scan` (agent of the visit, multipart `file`, JPEG/PNG/WebP/BMP/TIFF, 10 MB): returns `{ text, confidence, engine, empty }` to prefill the notes form; nothing is saved. Runs Tesseract (French + English) on the server behind an `OcrEngine` interface (`src/ocr/`), so a cloud OCR can replace it. Good on printed text and neat handwriting (94 % confidence on a test note), weaker on cursive.

## 5. AI Chatbot — entirely missing

Per-company AI assistant with suggested prompts ("Résume-moi cette entreprise", "Quelles offres Orange puis-je proposer ?", "Pourquoi cette entreprise a un score IA élevé ?").

- [ ] `POST /companies/:id/chat` — send a message, get an AI reply (conversation-scoped to a company)
- [ ] `GET /companies/:id/chat` — fetch chat history for a company
- [ ] Something to explain/compute `Company.ai_score` — the field already exists on the model, but no endpoint exposes *why* a score is what it is, which the chatbot needs to answer. **Blocked:** scores are imported values (CSV), no scoring formula exists to explain; this needs a scoring model or an AI service, together with the chatbot.

## 6. Profile — self-service gaps

"Mon profil" lets the user edit their own info and upload a profile photo. Today `PATCH /users/:userId` exists but is manager/superadmin-only (for managing others), and there's no self-update or avatar endpoint.

- [x] `PATCH /users/me` — update caller's own profile (name, phone, etc.). Frontend: `/settings` page (self-service profile card).
- [x] `POST /users/me/avatar` — upload/replace profile photo (`multipart/form-data`, 2MB cap). Also built: `DELETE /users/me/avatar`, `GET /users/:userId/avatar` (self/manager-of-own-agents/superadmin only).
- [x] Avatar storage — built as `avatar_mime`/`avatar_data` (`Bytes` in Postgres, same pattern as ticket/visit-report attachments) on `User`/`Superadmin`, not a separate `avatar_url` field.

## 7. Companies — implemented

Figma splits the company list into "Entreprises visited" vs "not visited" tabs/filters. `GET /companies` exists but should confirm it supports a visited/not-visited filter (derived from assignments/meetings status) — if not, add a query param.

- [x] `GET /companies?visited=true|false`. "Visited" = at least one completed meeting, completed assignment, or prospection with a visit date; for agents, visited by them. Every company in the list also carries a `visited` flag.

# Part B — Web app

All roles (agent, manager, superadmin) can use the web app; endpoints should scope data/actions by the caller's role (e.g. an agent sees only their own assignments/companies, a manager sees their team's, a superadmin sees everything) rather than being gated to managers only.

## 8. AI Prospecting ("Prospection IA") — implemented

A whole module with no backend equivalent: a company list filtered/scored by AI, a shortlist workflow, configurable search criteria, and prospecting history.

- [x] `Shortlist`/`ProspectingEntry` model (company_id, added_by, added_at, status)
- [x] `GET /prospecting` — list AI-surfaced companies (table: ENTREPRISE, STATUT, Date d'ajout)
- [x] `POST /prospecting/:companyId/shortlist` — add a company to the shortlist
- [x] `DELETE /prospecting/:companyId/shortlist` — remove from shortlist
- [x] `POST /prospecting/:companyId/assign` — assign a shortlisted company (agent/manager)
- [x] `GET /prospecting/criteria` / `PATCH /prospecting/criteria` — get/set AI search criteria (secteur, tranche d'effectif, taille de l'entreprise)
- [x] `GET /prospecting/history` — prospecting activity history
- [ ] Ties into the same "explain `ai_score`" gap noted in Part A §5 — the criteria endpoints and the scoring explanation likely share the same AI service (blocked, see §5)

## 9. Tickets (web, labeled "Rapports" in the Figma) — support-ticket system

Distinct from the mobile "Rapports" (visit reports, Part A §3), despite sharing a name in the Figma: this web screen is an internal issue/ticket tracker for problems raised against reports, companies, or visits ("Problème avec un rapport/une entreprise/une visite", "Rapport mensuel incomplet", "Visite non enregistrée"), with date/status filters, search, and assignment to an admin. Built as `Ticket`, not folded into `ProspectingMeeting`/reports — see the naming note at the top of this doc.

- [x] `Ticket` model (id, number, type, subject, description, priority, status, attachment, created_by_id, resolved_at, created_at) — `prisma/schema.prisma`. Tickets can be linked to a company and/or a visit (`relatedCompanyId`, `relatedMeetingId` on `POST /tickets`, returned as `related_company` / `related_meeting`). Linking a visit also links its company; users can only link visits they take part in and companies they work with.
- [x] `GET /tickets` — list, role-scoped (managers/agents see only their own; superadmin sees all), filterable by `status`/`type`/`priority`, `q` (subject, description, or reference like `#TCK-0012`), `from`/`to` (creation date) and `relatedCompanyId`.
- [x] `POST /tickets` — raise a ticket (any role), with an optional attachment (stored as `Bytes` in Postgres, 5MB cap) — `POST /tickets/:id/attachment` download endpoint too.
- [x] `PATCH /tickets/:id` — update status/priority (superadmin only; sets `resolved_at` when moved to RESOLVED).
- [x] `POST /tickets/:id/replies` — admin reply thread on a ticket (not in the original spec, added on top: `TicketReply` model, superadmin-only).
- [x] `PATCH /tickets/:id/assign` — assign/unassign a ticket to an administrator (`assigned_to_id`, superadmin-only, with `GET /tickets/assignees`).

**Bug, not just a gap:** the design shows a monthly-report PDF export failing at 95% with a server error ("Erreur lors de l'export PDF", code 500).

- [x] Monthly rollup: `GET /reports/monthly?month=YYYY-MM` (JSON) and `GET /reports/monthly/export?month=YYYY-MM` (PDF), role-scoped (agent: own month, manager: team, superadmin: all). Visits (planned, done, cancelled, missed), visit reports by status / interest / outcome, field reports by verdict, activity per agent, and the list of reports. PDFs now use `pdfkit` (`src/common/pdf/`) with the Orange B2B logo, multi-page tables and proper accents; `GET /reports/:id/export` was moved to it too (it used to print accents as "?").

## 10. Assignment & visit-scheduling KPIs — implemented

"Assignation" and "Planifier une visite" both show summary stats with no backing aggregation endpoint: Assignations totales, Rapports en attente, Visites aujourd'hui/cette semaine, Première/Prochaine visite planifiée.

- [x] `GET /assignments/summary`, role-scoped: `totalAssignments`, `assignmentsByStatus`, `reportsAwaitingReview` ("Rapports en attente"), `overdueAssignments`, `visitsToday`, `visitsThisWeek` (Tunis time), `firstVisitToday`, `nextVisit`.

## 11. Web dashboard ("Tableau de bord") — implemented

Web dashboard KPIs are broader than the mobile ones: TOTAL Entreprises, entreprises non assignées, agents sans assignation, visites à confirmer, "Actions prioritaires" (à assigner / à confirmer), visites à venir. Some of these (unassigned companies, agents without assignment) are only meaningful for manager/superadmin; an agent's view of this endpoint should just fall back to their own scope (effectively the same shape as `GET /me/dashboard` in Part A §2).

- [x] `GET /dashboard` — role-scoped: manager/superadmin get the full rollup (unassigned companies count, agents-without-assignment count, visits pending confirmation, prioritized action list, upcoming visits); an agent calling it gets their own data, same as `GET /me/dashboard`

## 12. Per-user assigned companies — implemented

"Gestion des utilisateurs" shows "Entreprises assignées" per user row/detail, and the mobile "Mon profil"/web tables imply a user↔company relationship view beyond `Company.manager_id`.

- [x] `GET /users/:userId/companies` and `GET /users/me/companies`: the companies a manager manages, or the companies an agent has visits with, each with `visits: { total, completed, upcoming }`, `lastVisitAt`, `nextVisitAt`, `aiScore`. Superadmins see anyone, managers themselves and their agents, agents themselves.

## 13. 2FA disable + notification preferences — implemented

"profile setting" has an "Activer la A2F" toggle (enabling exists via `/mfa/totp/setup|confirm`, but there's no way to turn it back off) and a "Notifications des résultats d'analyses" toggle (depends on the notification system from Part A §1 existing first).

- [x] `POST /mfa/disable` — disable TOTP/MFA for the caller (falls back to email codes; requires current password). Also built: self-service enable — `POST /mfa/totp/self-setup` + `POST /mfa/totp/self-confirm` (the existing `/mfa/totp/setup|confirm` pair only works mid-login via an `mfaToken` challenge, not for an already-authenticated caller).
- [x] `PATCH /users/me/notification-preferences` — toggle analysis-result emails (`notifyAnalysisResults`) and activity emails (`notifyWorkUpdates`). Frontend: `/settings` notifications card. Per-type switches (ticket replies, ticket assigned, visit reminders, report submitted/validated, new notes) are stored in `email_opt_outs` and sent as `emailPreferences`; Settings only shows the ones that apply to the role.