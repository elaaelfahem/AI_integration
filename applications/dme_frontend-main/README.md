# DME Frontend

Next.js (App Router) frontend for DME (Digital Market Engagement). It covers authentication (login, MFA, password reset, invitation-based setup), session handling against the DME NestJS API, and the manager/agent workspace: user & team management, company records, visit assignments, and in-app notifications.

## Setup

Copy `.env.example` to `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001

# Firebase web app (Project settings > General > Your apps > Config)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
# Project settings > Cloud Messaging > Web Push certificates
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

The Firebase web config is not secret (it ships to the browser). The backend holds the secret service account key.

Start the backend on port 3001, then run:

```bash
npm install
npm run dev
```

The frontend is available at `http://localhost:3000`.

## Pages

- `/login`, `/otp` — sign-in and MFA (SMS, email, or authenticator app) verification.
- `/invite` — accept a manager/agent invitation and set the account's password.
- `/dashboard` — role-aware landing page.
- `/users` — SUPERADMIN/MANAGER user & team management: invite, edit, block/unblock, soft-delete, manage pending invitations. Agents must be assigned a manager at invite time.
- `/agents` — MANAGER view of their own agents plus company assignment shortcuts.
- `/companies` — company records with search/filters, CSV/XLSX export and CSV import, and an "Assign" action that opens a prefilled assignment drawer. Agents see only companies assigned to them.
- `/companies/[id]` — company detail view.
- `/assignments` — manager-to-agent visit scheduling, status updates, and an agent workload summary. Agents see only their own assignments.
- `/profile` — the signed-in account's own profile, including a live team-overview summary for managers/superadmins.
- `/settings`: password, two-factor authentication and email preferences: "Résultats d'analyses", "E-mails d'activité" and, under it, one switch per email type, shown only for the roles that receive it (greyed out while activity emails are off).
- `/settings/notifications`: every notification of the account, with search, status (all/unread/read) and category filters, multi-select, mark as read, and delete (one, selection, or all read ones, with confirmation).

## Notifications

- The bell in the top bar (`components/workspace/notification-bell.tsx`) shows the unread count (refreshed every minute and when the tab regains focus) and a dropdown of the latest notifications, 15 at a time with "Voir plus".
- Clicking a notification marks it as read and opens its page (`link`). "Tout marquer comme lu" clears the badge, and "Voir toutes les notifications" opens `/settings/notifications`.
- The notifications page dispatches `dme:notifications-changed` after each change so the bell badge updates at once.
- Notification titles and bodies are written by the backend in French, like the emails. The interface around them follows the FR/EN switch.
- Each notification also has `entityType` + `entityId` (the assignment, meeting, report or ticket it is about), used by the mobile app to open that exact item. The full list of notifications is in `dme_backend/NOTIFICATIONS.md`.
- Push notifications (Firebase Cloud Messaging) come next: the Firebase variables below are already in place.

Tables shared across these pages use a common compact pagination component (`components/shared/pagination.tsx`) with a rows-per-page selector (default 10).

## Authentication behavior

- Access tokens remain in memory and are never written to browser storage.
- The refresh token is handled by the backend HTTP-only cookie.
- A refresh is attempted when a stored browser session is restored.
- Protected requests retry once after refreshing an expired access token.
- Mouse movement, keyboard input, clicks, and scrolling trigger `/touch` at most once per minute.
- Activity monitoring only runs while authenticated and the document is visible.
- A local check runs every second and returns the user to login when the backend-provided idle lifetime reaches zero.
- Login, refresh, and touch responses synchronize the remaining idle lifetime without comparing the browser clock to the server clock.
- The activity watcher uses the backend-provided touch interval, keeping development and production timing aligned.
- A touch request already in flight is allowed to finish before the session can expire locally.
- Transient network failures do not log the user out. An authentication `401` does.
- Development builds show the live idle countdown after login. It shares the expiry deadline and resets from every successful `/touch` response.
- Logout clears both the server session and local account state.

The account profile is kept in `sessionStorage` so the UI can be restored after a page reload. Refresh re-synchronizes timing with the database. Browser storage contains neither token.

For a quick 12-second local test, configure the backend with `SESSION_IDLE_TIMEOUT_MS=12000` and `TOUCH_INTERVAL_MS=1000`. The frontend receives both values automatically.

## Internationalization

The UI ships English and French copy under `lib/i18n/messages/{en,fr}.ts`, typed against a shared `Messages` interface in `types.ts`. Pages consume strings via the `useI18n()` hook (`{ messages, locale, setLocale }`) and `interpolate(template, vars)` for `{{placeholder}}` substitution; the active locale is switched from the top bar. When signed in, the choice is also saved to the account (`PATCH /users/me/language`) so emails and notifications follow it, and the account language is applied again at the next login.

## Structure

- `components/auth/auth-provider.tsx` owns authentication state (login, MFA, refresh, logout).
- `lib/api.ts` owns API requests, in-memory access tokens, and refresh deduplication.
- `hooks/use-activity-monitor.ts` and `hooks/use-session-expiry.ts` own throttled activity tracking and idle-timeout countdown.
- `components/user-management/`, `components/companies/`, `components/user-profile/` own the management pages' presentation.
- `components/shared/` holds cross-page building blocks (filter dropdown, pagination, drawer fields).
- `components/workspace/notification-bell.tsx` and `components/settings/notifications-page.tsx` own the bell and the notifications page; `types/notifications.ts` holds their shared types and categories; `lib/relative-time.ts` formats "il y a 2 heures".
- `app/globals.css` is a custom (non-Tailwind) design system layered on top of Orange Boosted's tokens: sharp corners, 1px black outlines, and the core black/white/`#ff7900` palette.
- `PRODUCT.md` and `DESIGN.md` capture product and Orange design-system decisions.

## Verification

```bash
npm run lint
npm run build
```

The interface uses Orange Boosted 5.3.7, follows its square component geometry and core black, white, and `#ff7900` palette, and targets WCAG 2.1 AA. Version 5.3.7 is pinned because the published 5.3.8 npm package is missing its compiled CSS directory.
