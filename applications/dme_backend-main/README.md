# DME Backend

NestJS and PostgreSQL API for DME (Digital Market Engagement). It covers authentication and MFA, invitation-based onboarding for managers and agents, user/team management, company records (with import/export), manager-to-agent visit assignments, and the platform's emails and in-app notifications.

## Roles

- **SUPERADMIN** — seeded once at startup. Manages managers, sees every company/assignment, and cannot be invited or deleted.
- **MANAGER** — invited by a superadmin. Manages their own agents, companies, and assignments.
- **AGENT** — invited by a manager (or by a superadmin, who must pick the agent's manager at invite time). Sees only the companies and assignments assigned to them.

Deleting a user is a soft delete: the account status moves to `DELETED`, its sessions are invalidated, and it disappears from list views without losing history.

## Authentication flow

- `POST /login` validates credentials, replaces any existing session, and either returns a five-minute access token (setting a seven-day refresh token in the `refresh_token` HTTP-only cookie) or an MFA challenge.
- `POST /mfa/request` sends a one-time code (SMS or email); `POST /mfa/verify` completes login with it. `POST /mfa/totp/setup` and `POST /mfa/totp/confirm` handle authenticator-app enrollment.
- `POST /touch` requires the bearer access token and refresh cookie. It records activity with one atomic database write at most once per minute.
- `POST /refresh` rotates the refresh token and returns a new five-minute access token.
- `POST /logout` removes the active session and clears the refresh cookie.
- A refresh or touch fails after `SESSION_IDLE_TIMEOUT_MS` without recorded activity and removes the expired session.
- Only a SHA-256 refresh-token hash is stored in PostgreSQL. Each account has one active session; a new login invalidates the previous one.
- Login, refresh, and touch responses include `lastActive`, `idleExpiresInMs`, and `touchIntervalMs`. The frontend follows these backend values instead of maintaining separate timing constants.
- `POST /password/setup` completes an invited account's first password. `POST /password/reset/request`, `/reset/verify`, and `/reset/confirm` handle self-service password resets, throttled by `PASSWORD_RESET_EMAIL_LIMIT` per `PASSWORD_RESET_EMAIL_WINDOW_MS`.

## API overview

- **`/users`** — list/search users and pending agents, `GET /users/me` (own profile, includes manager name), connection history, CSV/XLSX export, block/unblock, edit (`PATCH /users/:userId`), and soft delete.
- **`/companies`** — CRUD, CSV/XLSX export, CSV import, scoped to the requesting role: superadmins and managers can work with active companies, while agents see only companies assigned to them.
- **`/assignments`** — schedule, update (status/reassign), and cancel manager-to-agent company visits. Each assignment can carry a persisted prospection lifecycle and field report.
- **`/prospections/:assignmentId/update`** — update the prospection lifecycle (`PLANNED`, `IN_PROGRESS`, `VISITED`, `FOLLOW_UP`, `CONVERTED`, or `CLOSED`) with notes and follow-up information. Managers and superadmins can manage their permitted assignments; agents can update their own assignments.
- **`/reports/:assignmentId`** — submit or read the original field report and its structured processing result. The original input is retained separately from the deterministic structured result, and access is scoped to the assignment.
- **`/reports/:assignmentId/export`** — download the accessible field report as a PDF. Export failures are returned as API errors and do not remove the stored report.
- **`/invitations`** — invite/resend/cancel manager or agent invitations, and verify/accept an invite token (`/invitations/check`, `/invitations/verify`).
- **`/me/dashboard`**: the agent's own home screen (mobile Accueil): KPIs, next visit, open assignments.
- **`/assignments/summary`**: role-scoped stats for the assignment and planning pages.
- **`/users/:userId/companies`** and **`/users/me/companies`**: companies a manager manages or an agent visits, with visit stats.
- **`/companies?visited=true|false`**: visited / never visited companies; every company also carries a `visited` flag.
- **`/reports/monthly`** and **`/reports/monthly/export`**: monthly rollup of visits and reports as JSON or PDF (role-scoped).
- **`/visit-reports/by-meeting/:meetingId/scan`**: OCR of a photo of notes ("Scanner mes notes"), Tesseract behind `src/ocr/OcrEngine`.
- **`/tickets`**: also links a ticket to a company or visit, and filters by search (`q`), dates and company.
- **Mobile app:** every endpoint the agent app uses is listed in [MOBILE_API.md](MOBILE_API.md).
- **`/notifications`**: the caller's in-app notifications (the bell) and push devices. See [Emails and notifications](#emails-and-notifications).
- **`/users/me/language`**: `PATCH { language: "fr" | "en" }`. Saved in `locale` on the account (default `fr`) and returned as `language` in the session account and `GET /users/me`.
- **`/users/me/notification-preferences`**: `notifyAnalysisResults` and `notifyWorkUpdates` email switches, plus `emailPreferences` to turn off one email type at a time (`ticketReply`, `ticketAssigned`, `meetingReminder`, `reportSubmitted`, `reportReviewed`, `noteAdded`; see `EMAIL_PREFERENCES` in `notification.types.ts`). The bell entry is created either way.

Swagger UI at `http://localhost:3001/api/docs` documents full request/response shapes, validation, and auth requirements for every route.

## Emails and notifications

Every platform email lives in `src/mail/`. `MailService` is the single entry point: login emails (codes, invitations) throw so the caller can report the failure, while event emails are fire-and-forget (`void this.mailService.assignmentCreated(id)`), never throw and never block the action that triggered them.

**The full catalog of the 35 notifications** (recipient, trigger, channels, example text, schedule) is in [NOTIFICATIONS.md](NOTIFICATIONS.md).

An event can produce three things, depending on its channels:

1. **An in-app notification** (bell), stored in `notifications` for every active recipient, whatever their email preferences. It carries a `link` and, when it is about one item, `entityType` + `entityId`.
2. **A push** (Firebase) to every device of the recipient.
3. **An email**, sent according to the recipient's preferences.

Everything is written in the recipient's language (`mail.i18n.ts`, French by default, English when the account chose it). Login codes follow the account found for the email. Invitations are always in French.

Most events use all three. Reminders (visite imminente, rappel J-1, compte rendu à compléter, assignation en retard) are bell + push only, the evening visit list is email only, and "Programme du jour" is push only.

| Category | Email rule | Examples |
|---|---|---|
| Security | Always sent, even to a blocked account | Password changed, reset required, account blocked/restored, authenticator app on/off |
| Activity | Only if `notify_work_updates` is on and the type is not turned off in `email_opt_outs` | Visit assigned/rescheduled/cancelled, meeting planned, visit report to validate/validated, tickets, invitation accepted, collection failed, reminders, weekly digest |
| Analysis | Only if `notify_analysis_results` is on | Visit report analysis verdict |

The 35 notification types and their filter categories (security, team, visits, reports, tickets, data) are listed in `src/notifications/notification.types.ts`. Email screenshots are in the `docs/emails` repository.

**Scheduled jobs** (`src/mail/mail.scheduler.ts`, Africa/Tunis time). Each scheduled notification is recorded in `scheduled_notification_log`, so it goes out once even if a job runs twice:

- Every 5 minutes: "Visite imminente" (about 1 h before a visit) and "Compte rendu à compléter" (2 h after a visit without a submitted report).
- Every day at 08:00: overdue assignments, yesterday's missing reports, and the push-only "Programme du jour".
- Every day at 18:00: the email listing tomorrow's visits, plus one bell/push "Rappel" per visit.
- Every Monday at 08:00: weekly summary for each manager with something pending.

Visits and assignments have a `reminderEnabled` switch ("Recevez un rappel 1 jour avant la visite", default on). Turning it off stops that visit's reminders.

**New device login:** each successful login is compared with the account's logins from the last 180 days (OS + browser). An unknown device triggers a security notification and email.

**Templates** (`src/mail/templates/`):

- `layouts/base.html` + `event.txt`: shared layout for every event email (logo, title, details box, button, signature).
- `partials/`: paragraph, details table, button, code digit.
- `verification-code.*` and `invitation.*`: login emails.

To add an event email, add a method to `MailService` that calls `this.send(recipient, category, { type, subject, title, paragraphs, details, action })`, add its `type` to `notification.types.ts`, and call it with `void` after the action succeeds.

### `/notifications` routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/notifications?cursor=&limit=&q=&status=&category=` | List, newest first. `q` searches title and body, `status` is `all`/`unread`/`read`. Returns `items`, `nextCursor`, `total` (matching filters) and `unreadCount` |
| GET | `/notifications/unread-count` | Bell badge |
| PATCH | `/notifications/:id/read` | Mark one as read |
| POST | `/notifications/read` | Mark the selected ids as read (`{ ids }`, up to 100) |
| POST | `/notifications/read-all` | Mark everything as read |
| DELETE | `/notifications/:id` | Delete one |
| POST | `/notifications/delete` | Delete the selected ids (`{ ids }`, up to 100) |
| POST | `/notifications/delete-read` | Delete every read notification |
| POST | `/notifications/devices` | Register a Firebase push token `{ token, platform: WEB\|ANDROID\|IOS }` |
| POST | `/notifications/devices/unregister` | Remove it on logout |

Every route only touches the caller's own rows. Blocking or deleting a user also removes their push devices.

**Push (Firebase Cloud Messaging):** every new notification is also pushed to the account's registered devices (`src/notifications/push.service.ts`). Tokens Firebase reports as dead are deleted. Without `FIREBASE_SERVICE_ACCOUNT`, push is disabled and everything else works. The Flutter integration guide is in [MOBILE_NOTIFICATIONS.md](MOBILE_NOTIFICATIONS.md).

## Environment

Copy `.env.example` to `.env.local` and provide:

```dotenv
DATABASE_URL=postgresql://...
PORT=3001

MAIL_HOST=localhost
MAIL_PORT=1025

JWT_ACCESS_SECRET=a-long-random-secret
JWT_REFRESH_SECRET=a-different-long-random-secret
COOKIE_SECURE=false
FRONTEND_URL=http://localhost:3000
EMAIL_DOMAIN_WHITELIST=*
SESSION_IDLE_TIMEOUT_MS=900000
TOUCH_INTERVAL_MS=60000
PASSWORD_RESET_EMAIL_LIMIT=3
PASSWORD_RESET_EMAIL_WINDOW_MS=900000

SUPERADMIN_EMAIL="admin123@example.com"
SUPERADMIN_PASSWORD="SecurePassword123!"
SUPERADMIN_FIRST_NAME="Super"
SUPERADMIN_LAST_NAME="Admin"
SUPERADMIN_PHONE="+216 20 123 456"

# Firebase Admin (push notifications): base64 of the service account JSON
FIREBASE_SERVICE_ACCOUNT=
```

- Use `COOKIE_SECURE=true` behind HTTPS in staging and production. Generate independent JWT secrets with a cryptographically secure random generator.
- `FRONTEND_URL` is used to build invitation and password-reset links sent by email.
- `EMAIL_DOMAIN_WHITELIST` restricts which email domains can be invited (`*` allows any domain).
- `MAIL_HOST`/`MAIL_PORT` point at an SMTP server — locally this is typically [Mailpit](https://github.com/axllent/mailpit) (`localhost:1025`, web UI on `:8025`).
- `FIREBASE_SERVICE_ACCOUNT` is the Firebase service account key (Project settings > Service accounts > Generate new private key), base64-encoded on one line. In PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\key.json"))`. Never commit the JSON file.
- Both session durations are milliseconds; `TOUCH_INTERVAL_MS` must be shorter than `SESSION_IDLE_TIMEOUT_MS`. For a quick local test:

```dotenv
SESSION_IDLE_TIMEOUT_MS=12000
TOUCH_INTERVAL_MS=1000
```

- The SuperAdmin seed requires `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_FIRST_NAME`, `SUPERADMIN_LAST_NAME`, and `SUPERADMIN_PHONE`. Seeding creates or updates the one active SuperAdmin account and loads sample company data from `prisma/seeds/data/`.

## Setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```

## Protecting routes

Apply `AccessTokenGuard` to routes that require a signed access token. Add `RolesGuard` and the `Roles('SUPERADMIN')`, `Roles('MANAGER')`, or `Roles('AGENT')` decorator when a route needs role authorization. The auth module exports both guards.

## Verification

```bash
npm test
npm run test:e2e
npm run lint
npm run build
```

The end-to-end suite exercises request validation, invalid credentials, secure cookie behavior, access-token protection, touch throttling, refresh rotation, inactivity expiry, and logout through the Nest HTTP application.

## PDFs and OCR

- PDFs are built with `pdfkit` through `src/common/pdf/pdf-document.ts` (`DmePdf`): Orange B2B logo, sections, key/value lists, tables that continue on new pages, page numbers. The logo lives in `src/common/pdf/assets/` and is copied to `dist` by `nest-cli.json`.
- OCR uses `tesseract.js` (French + English) through `OcrEngine` in `src/ocr/`. Language data (about 15 MB) is downloaded on the first scan and cached in the system temp folder, so the server needs internet access once. To use a cloud OCR instead, provide another `OcrEngine` in `OcrModule`.
