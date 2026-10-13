# Mobile API (agent app)

Every backend endpoint the Flutter app can use, grouped by screen. The mobile app is for **agents**: all routes below answer with the agent's own data.

- Base URL: the backend (`http://localhost:3001` locally). Full request/response shapes: Swagger at `/api/docs`.
- Authenticated routes need `Authorization: Bearer <accessToken>`.
- Errors: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`. 401 means the access token expired: refresh, then retry once.
- Dates are ISO 8601 in UTC (`2026-10-07T09:00:00.000Z`). Display them in Tunis time.
- Push notifications and the notification list are detailed in [MOBILE_NOTIFICATIONS.md](MOBILE_NOTIFICATIONS.md); the full notification catalog is in [NOTIFICATIONS.md](NOTIFICATIONS.md).

## 1. Sign in and session

| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/login` | `{ email, password }` | Returns either a session (`accessToken`, timing info) or an MFA challenge (`mfaRequired: true, mfaToken, mfaType`) |
| POST | `/mfa/request` | `{ mfaToken, method: "EMAIL" }` | Sends the 6-digit code |
| POST | `/mfa/verify` | `{ mfaToken, code }` | Returns the session |
| POST | `/refresh` | none | Rotates the session. Needs the `refresh_token` cookie set by login/verify |
| POST | `/touch` | none | Keeps the session alive (at most once a minute, on user activity) |
| POST | `/logout` | none | Call `POST /notifications/devices/unregister` **before** it |

**Language:** the session response (`account.language`) and `GET /users/me` (`language`) carry the account language. Use it to pick the app language on login, and save a change with `PATCH /users/me/language`.

**Session on mobile:** the access token lasts 5 minutes. The refresh token comes back as an **HTTP-only cookie** named `refresh_token`. Use a cookie jar (for example `dio` + `cookie_jar` with persistent storage) so `/refresh` sends it. A session expires after 15 minutes without `/touch` or `/refresh`. Each account has one active session: logging in on the phone logs the web session out.

**First login and password reset**

| Method | Route | Body |
|---|---|---|
| POST | `/invitations/check` | `{ token }` from the invitation link |
| POST | `/invitations/verify` | `{ token, password }` (temporary password from the email) → `setupToken` |
| POST | `/password/setup` | `{ setupToken, password, confirmPassword }` |
| POST | `/password/reset/request` | `{ email }` → code by email |
| POST | `/password/reset/verify` | `{ email, code }` → `resetToken` |
| POST | `/password/reset/confirm` | `{ resetToken, password, confirmPassword }` |

## 2. Accueil (home)

| Method | Route | Use |
|---|---|---|
| GET | `/me/dashboard` | Everything the home screen shows, in one call |
| GET | `/notifications?limit=2` | The 2 latest notifications under the bell |
| GET | `/notifications/unread-count` | "2 Nouveaux" |

`GET /me/dashboard`:

```json
{
  "firstName": "Yassine",
  "lastName": "Khelifi",
  "kpis": {
    "plannedVisits": 8,
    "totalVisits": 12,
    "assignedCompanies": 24,
    "reportsToComplete": 3
  },
  "nextVisit": {
    "kind": "meeting",
    "id": "…",
    "company": { "id": "…", "name": "Sofrecom", "address": "Les Berges du Lac 1, 1053 Tunis", "governorate": "Tunis" },
    "scheduledAt": "2026-10-07T13:30:00.000Z",
    "durationMinutes": 60,
    "status": "SCHEDULED",
    "visitType": "FIRST_VISIT",
    "priority": null
  },
  "assignments": [
    { "id": "…", "company": { "id": "…", "name": "Dataxion" }, "scheduledAt": "2026-08-26T09:00:00.000Z", "status": "ASSIGNED", "priority": "HIGH" }
  ],
  "unreadNotifications": 2
}
```

| KPI | Meaning |
|---|---|
| `plannedVisits` | Visits from now on (scheduled meetings and open assignments) |
| `totalVisits` | All the agent's visits except cancelled or missed ones |
| `assignedCompanies` | Distinct companies among those visits |
| `reportsToComplete` | Visits that ended without a submitted report |

`nextVisit.kind` tells which API owns it: `meeting` → `/meetings/:id`, `assignment` → `/assignments`. `priority` only exists on assignments. `assignments` are the 5 next open assignments ("Mes assignations": `scheduledAt` is the "Échéance").

## 3. Calendrier (visits)

| Method | Route | Body / query | Notes |
|---|---|---|---|
| GET | `/meetings` | `?from=&to=&status=&companyId=` | The agent's meetings |
| GET | `/meetings/:id` | | One meeting (company, manager, agent, report status) |
| POST | `/meetings` | `{ companyId, title, scheduledAt, durationMinutes, agenda?, location?, meetingUrl?, visitType?, reminderEnabled? }` | "Nouvelle visite". The agent's manager is set automatically |
| PATCH | `/meetings/:id` | any of the fields above, `status` (`IN_PROGRESS`, `COMPLETED`), `outcome`, `completionNotes`, `reminderEnabled` | Agents can't reassign or cancel |
| GET | `/assignments` | | The agent's assignments |
| PATCH | `/assignments/:id` | `{ status }` (`ASSIGNED`→`IN_PROGRESS`→`COMPLETED`) or `{ reminderEnabled }` | Agents can only move the status forward and toggle the reminder |
| GET | `/assignments/summary` | | Counts, visits today / this week, first visit today, next visit |

**"Recevez un rappel 1 jour avant la visite"** is `reminderEnabled` (default `true`). Off = no reminder the day before, no "Visite imminente".

## 4. Rapports (visit reports)

A report belongs to a meeting and can only be written once the meeting is `COMPLETED`.

| Method | Route | Body / query | Notes |
|---|---|---|---|
| GET | `/visit-reports` | `?status=&outcomeResult=&interestLevel=&companyId=&from=&to=` | The agent's reports |
| GET | `/visit-reports/stats` | | Counts by status |
| GET | `/visit-reports/by-meeting/:meetingId` | | The report of a visit (with notes and attachments) |
| PUT | `/visit-reports/by-meeting/:meetingId` | `{ summary?, needs?, solutions?, interestLevel?, outcomeResult? }` | Create or edit the draft |
| POST | `/visit-reports/by-meeting/:meetingId/submit` | | Send it to the manager (needs a `summary`) |
| POST | `/visit-reports/by-meeting/:meetingId/notes` | `{ body }` | Free-text note, any time after the visit. The manager is notified |
| DELETE | `/visit-reports/by-meeting/:meetingId/notes/:noteId` | | Own notes only |
| POST | `/visit-reports/by-meeting/:meetingId/attachments` | multipart `file` (5 MB) | Draft only |
| GET / DELETE | `/visit-reports/by-meeting/:meetingId/attachments/:attachmentId` | | Download / remove (draft only) |
| POST | `/visit-reports/by-meeting/:meetingId/scan` | multipart `file`: JPEG, PNG, WebP, BMP or TIFF, 10 MB | **"Scanner mes notes"**: returns `{ text, confidence, engine, empty }` to prefill the notes field. Nothing is saved |
| GET | `/reports/monthly?month=YYYY-MM` | | The agent's month: visits, reports, outcomes |
| GET | `/reports/monthly/export?month=YYYY-MM` | | Same month as a PDF |

Enums: `needs` = `CONNECTIVITY`, `CLOUD`, `SECURITY`, `SD_WAN`, `OTHER`; `solutions` = `ORANGE_BUSINESS_VPN`, `FLEXIBLE_ENGINE_CLOUD`, `ORANGE_CYBERDEFENSE`, `OTHER`; `interestLevel` = `LOW`, `MEDIUM`, `HIGH`; `outcomeResult` = `INTERESTED`, `TO_FOLLOW_UP`, `NEGOTIATION`, `OPPORTUNITY_WON`, `OPPORTUNITY_LOST`, `NOT_INTERESTED`. Status: `DRAFT` → `SUBMITTED` → `IN_REVIEW` → `VALIDATED`.

**Scan quality:** the scan uses Tesseract on the server. It reads printed and neat handwriting well (94 % confidence on a handwriting-style test note), cursive less so. Always let the agent edit the text before saving it as a note.

**Prospection flow (assignments):** field reports are separate from visit reports.

| Method | Route | Body |
|---|---|---|
| POST | `/prospections/:assignmentId/update` | `{ status, notes?, nextAction?, followUpAt? }` |
| POST | `/reports/:assignmentId` | `{ summary, needs, outcome, objections?, suggestedOffer?, nextAction?, followUpAt? }` |
| GET | `/reports/:assignmentId` | The field report and its verdict |
| GET | `/reports/:assignmentId/export` | PDF |

## 5. Entreprises

| Method | Route | Notes |
|---|---|---|
| GET | `/users/me/companies` | **"Entreprises assignées"**: every company the agent has visits with, with `visits: { total, completed, upcoming }`, `lastVisitAt`, `nextVisitAt`, `aiScore` |
| GET | `/companies?visited=true` | "Entreprises visitées": at least one completed visit by this agent |
| GET | `/companies?visited=false` | "Non visitées" |
| GET | `/companies` | Every company the agent is assigned to, each with a `visited` flag |
| GET | `/companies/:id` | Details: contact, address, sector, AI score, source evidence, history |
| PATCH | `/companies/:id` | Agents can update contact details of their companies |
| GET | `/companies/:companyId/reports` | The company's visit report history |

`GET /companies` only lists companies the agent has an **assignment** for, while `/users/me/companies` also includes companies with meetings only. For the "Entreprises assignées" tab, prefer `/users/me/companies`.

## 6. Profil

| Method | Route | Body / notes |
|---|---|---|
| GET | `/users/me` | Profile, MFA method, email preferences |
| PATCH | `/users/me` | `{ firstName?, lastName?, phone? }` |
| PATCH | `/users/me/language` | `{ language: "fr" | "en" }`. Emails, notifications and push follow it. Default is `fr` |
| POST / DELETE | `/users/me/avatar` | multipart `file` (2 MB) / remove |
| GET | `/users/:userId/avatar` | The photo (own, or the agent's manager) |
| POST | `/password/change` | `{ currentPassword, newPassword }` |
| GET | `/users/me/connections` | Login history |
| POST | `/mfa/totp/self-setup`, `/mfa/totp/self-confirm` | Turn on an authenticator app |
| POST | `/mfa/disable` | `{ password }` back to email codes |
| PATCH | `/users/me/notification-preferences` | `{ notifyWorkUpdates?, notifyAnalysisResults?, emailPreferences?: { meetingReminder?, reportReviewed?, ticketReply? } }`: email switches |

## 7. Notifications and push

| Method | Route | Notes |
|---|---|---|
| GET | `/notifications?limit=&cursor=&status=&category=&q=` | List, newest first, with `entityType` + `entityId` to open the exact item |
| GET | `/notifications/unread-count` | Badge |
| PATCH | `/notifications/:id/read` | |
| POST | `/notifications/read-all` | "Marquer tout comme lu" |
| DELETE | `/notifications/:id` | Swipe "Supprimer" |
| POST | `/notifications/read`, `/notifications/delete` | `{ ids: [...] }` |
| POST | `/notifications/devices` | `{ token, platform: "ANDROID" \| "IOS" }` after login and on each app start |
| POST | `/notifications/devices/unregister` | `{ token }` before logout |

Setup and payload: [MOBILE_NOTIFICATIONS.md](MOBILE_NOTIFICATIONS.md).

## 8. Support (tickets)

| Method | Route | Body / query |
|---|---|---|
| GET | `/tickets` | `?status=&type=&priority=&q=&from=&to=&relatedCompanyId=` (`q` also matches `#TCK-0012`) |
| GET | `/tickets/stats` | Counts by status |
| GET | `/tickets/:id` | With admin replies |
| POST | `/tickets` | multipart or JSON: `{ type, subject, description, priority?, relatedCompanyId?, relatedMeetingId? }` + optional `file` (5 MB) |
| GET | `/tickets/:id/attachment` | Download |

`type`: `TECHNICAL`, `CONNECTION`, `COMPANY`, `REPORT`, `AI`, `VISIT`, `OTHER`. Linking a visit (`relatedMeetingId`) also links its company. An agent can only link their own visits and companies.

## Not available yet

- **AI chatbot** (`/companies/:id/chat`) and the **explanation of the AI score**: they need an AI service that the backend doesn't have yet.
