# Notification catalog

Every event the platform tells users about: who receives it, through which channel, and what it says. The code lives in `src/mail/mail.service.ts` (events), `src/mail/mail.scheduler.ts` (timed jobs), `src/notifications/` (bell, push, devices) and `src/notifications/notification.types.ts` (types, categories, email switches).

- Flutter integration: [MOBILE_NOTIFICATIONS.md](MOBILE_NOTIFICATIONS.md)
- Email screenshots: the `docs/emails` repository

## Channels

| Channel | What it is | Stored? |
|---|---|---|
| **Bell** | In-app notification (web bell, mobile "Accueil" list), via `GET /notifications` | Yes, `notifications` table |
| **Push** | Firebase Cloud Messaging to every registered device of the user | No (it points to the bell entry) |
| **Email** | French HTML email | No |

Each event uses one of four channel sets (`channels` in `EventEmail`):

| Set | Bell | Push | Email |
|---|---|---|---|
| `all` (default) | ✓ | ✓ | ✓ (if preferences allow) |
| `inbox` | ✓ | ✓ | |
| `email` | | | ✓ (if preferences allow) |
| `push` | | ✓ | |

## Delivery rules

- **Bell and push** go to every *active* recipient, whatever their email preferences. A blocked or deleted account gets nothing in the bell and loses its devices.
- **Security emails** always go out, even to a blocked account. They can't be turned off.
- **Activity emails** need `notify_work_updates` on (Settings > "E-mails d'activité"), and the type must not be turned off in the per-type switches (`email_opt_outs`).
- **Analysis emails** need `notify_analysis_results` on.
- **Failures never block the action:** a failed email, bell write or push is logged and the user's action still succeeds.
- **Dead push tokens** (app uninstalled, token rotated) are deleted automatically.
- **Language:** the backend writes the email, bell title and push text in the recipient's language (`locale` on the account, `fr` or `en`). New accounts default to French, and invitations are always in French because the person has no account yet. Changing the language (`PATCH /users/me/language`) applies to the next notifications; older ones keep their text.
- **Scheduled notifications** are recorded in `scheduled_notification_log`, so each one goes out once, even if a job runs twice or the server restarts.

## Item reference (deep links)

Each bell entry and push carries `link` (the web page) and, when it is about one item, `entityType` + `entityId`:

| `entityType` | `entityId` is | Open |
|---|---|---|
| `assignment` | assignment id | the assignment / visit details |
| `meeting` | meeting id | the meeting in the calendar |
| `visit_report` | **meeting id** (reports are read with `GET /visit-reports/by-meeting/:meetingId`) | the visit report |
| `ticket` | ticket id | the ticket |
| `user` | account id of the person | their profile (managers, admins) |
| `collection_job` | collection job id | the data sources page |

## Catalog

**Channels** column: B = bell, P = push, E = email. **Switch** is the per-type email key in `emailPreferences` (Settings), when there is one.

### Security (to the account owner)

| Type | When | Channels | Example | Link |
|---|---|---|---|---|
| `PASSWORD_CHANGED` | Password changed or reset | B P E | "Votre mot de passe DME a été modifié" | none |
| `PASSWORD_RESET_REQUIRED` | An admin forces a reset | B P E | "Réinitialisation de votre mot de passe requise" | none |
| `ACCOUNT_BLOCKED` | Account suspended | E only (the account is locked) | "Votre accès à Orange DME a été suspendu" | none |
| `ACCOUNT_UNBLOCKED` | Account restored | B P E | "Votre accès à Orange DME a été rétabli" | none |
| `TWO_FACTOR_ENABLED` | Authenticator app turned on | B P E | "Application d'authentification activée" | none |
| `TWO_FACTOR_DISABLED` | Authenticator app turned off | B P E | "Application d'authentification désactivée" | `/settings` |
| `NEW_DEVICE_LOGIN` | Login from a device (OS + browser) not used in the last 180 days. Never on the very first login | B P E | "Nouvelle connexion à votre compte depuis iPhone (Safari 17)." | `/settings` |

### Team

| Type | Recipient | When | Channels | Example | Entity |
|---|---|---|---|---|---|
| `INVITATION_ACCEPTED` | The person who invited | The invitee activates their account | B P E | "Mejdi Chennoufi a rejoint Orange DME" | `user` |

### Visits (mostly to agents)

| Type | Recipient | When | Channels | Example | Entity |
|---|---|---|---|---|---|
| `ASSIGNMENT_CREATED` | Agent | A visit is assigned, or reassigned to them | B P E | "Nouvelle visite assignée : Sigema" | `assignment` |
| `ASSIGNMENT_RESCHEDULED` | Agent | The manager changes the date | B P E | "Visite reprogrammée : Sigema" | `assignment` |
| `ASSIGNMENT_CANCELLED` | Agent | The manager cancels it | B P E | "La visite chez GlobalTech prévue le jeudi 28 août à 10:00 a été annulée." | `assignment` |
| `ASSIGNMENT_REMOVED` | Agent | Deleted, or given to another agent | B P E | "Visite retirée : Sigema" | `assignment` |
| `MEETING_SCHEDULED` | Agent, or manager if the agent planned it | A meeting is added | B P E | "Nouvelle visite planifiée : Sofrecom" | `meeting` |
| `MEETING_RESCHEDULED` | Agent | The meeting is moved | B P E | "Visite reprogrammée : Sofrecom" | `meeting` |
| `MEETING_CANCELLED` | Agent, or manager if the agent cancelled | Cancelled | B P E | "Visite annulée : Sofrecom" | `meeting` |
| `MEETING_REMOVED` | Former agent | Given to another agent | B P E | "Visite retirée : Sofrecom" | `meeting` |
| `VISIT_UPDATED` | Agent | The manager changes details without changing the date: objectives, type, priority, duration, company (assignments); subject, agenda, place, link, type, duration (meetings) | B P E | "Votre visite chez VERMEG a été mise à jour : les objectifs et la priorité." | `assignment` / `meeting` |
| `VISIT_TOMORROW` | Agent | 18:00 the day before, per meeting with its reminder on | B P | "N'oubliez pas votre visite chez Sofrecom demain à 09:30." | `meeting` |
| `ASSIGNMENT_DUE_SOON` | Agent | 18:00 the day before, per assignment with its reminder on | B P | "L'assignation Dataxion arrive à échéance demain à 14:00." | `assignment` |
| `VISIT_REMINDER` | Agent | 18:00, one email listing all of tomorrow's visits with reminders on. Switch: `meetingReminder` | E | "Rappel : 2 visites demain" | none |
| `VISIT_IMMINENT` | Agent | About 1 hour before a visit with its reminder on (checked every 5 min) | B P | "Votre visite chez Sofrecom commence dans 1 heure." | `assignment` / `meeting` |
| `ASSIGNMENT_OVERDUE` | Agent | 08:00 the morning after an assignment's date passed while still open (once, within 7 days) | B P | "L'assignation Dataxion a dépassé son échéance (26 août)." | `assignment` |
| `DAILY_AGENDA` | Agent | 08:00 on days with visits | P only | "Aujourd'hui : 3 visites, la première à 09:30 chez Sofrecom." | none |

A visit stored both as a meeting and as an assignment (same agent, company and time) is reminded once.

### Reports

| Type | Recipient | When | Channels | Example | Entity |
|---|---|---|---|---|---|
| `VISIT_REPORT_SUBMITTED` | Manager | The agent submits a visit report. Switch: `reportSubmitted` | B P E | "Compte rendu à valider : Sigema" | `visit_report` |
| `VISIT_REPORT_VALIDATED` | Agent | The manager validates it. Switch: `reportReviewed` | B P E | "Compte rendu validé : Sigema" | `visit_report` |
| `VISIT_REPORT_NOTE_ADDED` | Manager | The agent adds a note to their visit (only agents can write notes). Switch: `noteAdded` | B P E | "Nouvelle note : Sigema" | `visit_report` |
| `REPORT_DUE` | Agent | 2 h after a meeting ended with no submitted report (within a day), then again at 08:00 the next morning | B P | "Pensez à compléter le compte rendu de votre visite chez Sofrecom." | `visit_report` |
| `REPORT_ANALYZED` | Manager | A field report (prospection flow) is analysed. Needs "Résultats d'analyses" | B P E | "Analyse du rapport de visite : Agri Premium" | `assignment` |
| `WEEKLY_DIGEST` | Managers with something pending | Monday 08:00 | B P E | "Votre résumé DME de la semaine" | none |

### Tickets

| Type | Recipient | When | Channels | Example | Entity |
|---|---|---|---|---|---|
| `TICKET_CREATED` | Author | Ticket opened ("bien reçu") | B P E | "Ticket #TCK-0001 bien reçu" | `ticket` |
| `TICKET_URGENT` | All active admins | High or critical priority ticket | B P E | "Ticket #TCK-0001 en priorité haute : …" | `ticket` |
| `TICKET_ASSIGNED` | Assigned admin | Assigned by someone else. Switch: `ticketAssigned` | B P E | "Ticket #TCK-0001 vous est assigné" | `ticket` |
| `TICKET_REPLIED` | Author | An admin replies. Switch: `ticketReply` | B P E | "Nouvelle réponse sur le ticket #TCK-0001" | `ticket` |
| `TICKET_STATUS_CHANGED` | Author | Status changes (e.g. resolved). Switch: `ticketReply` | B P E | "Ticket #TCK-0001 résolu" | `ticket` |

### Data

| Type | Recipient | When | Channels | Example | Entity |
|---|---|---|---|---|---|
| `COLLECTION_JOB_FAILED` | Admin who launched it | A data collection fails | B P E | "Échec de la collecte de données" | `collection_job` |

## Schedule (Africa/Tunis time)

| When | Job | Sends |
|---|---|---|
| Every 5 minutes | `frequentReminders` | `VISIT_IMMINENT`, `REPORT_DUE` (2 h after the visit) |
| Every day 08:00 | `morning` | `ASSIGNMENT_OVERDUE`, `REPORT_DUE` (next morning), `DAILY_AGENDA` |
| Every day 18:00 | `visitReminders` | `VISIT_REMINDER` email, `VISIT_TOMORROW`, `ASSIGNMENT_DUE_SOON` |
| Monday 08:00 | `managerDigest` | `WEEKLY_DIGEST` |

## Per-visit reminder switch

"Recevez un rappel 1 jour avant la visite" in the Figma visit form is `reminderEnabled` (default `true`) on:

- `POST /meetings`, `PATCH /meetings/:id`
- `POST /assignments`, `PATCH /assignments/:id` (agents may change it on their own assignments)

It is stored as `reminder_enabled`. When it is off, the visit gets no `VISIT_TOMORROW` / `ASSIGNMENT_DUE_SOON`, no `VISIT_IMMINENT`, and is left out of the evening email.

## Adding a notification

1. Add the type to `NOTIFICATION_TYPES` and to a category in `NOTIFICATION_CATEGORIES` (`src/notifications/notification.types.ts`).
2. Add a method to `MailService` that loads what it needs and calls:
   ```ts
   this.send(recipient, 'work' | 'security' | 'analysis', {
     type, subject, title, paragraphs, details, action,
     entity: { type: 'assignment', id },
     channels: 'all', // or 'inbox', 'email', 'push'
   });
   ```
   The bell title is `subject`, its body the first paragraph, its link the path of `action.url`.
3. Call it with `void` right after the action succeeds, or from `MailScheduler` (use `claim()` so it goes out once).
4. If users should be able to turn its email off, add it to `EMAIL_PREFERENCES` and to the Settings switches.
5. Add it to this catalog and, if agents receive it, to the table in `MOBILE_NOTIFICATIONS.md`.
