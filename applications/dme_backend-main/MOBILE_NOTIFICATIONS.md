# Push notifications in the Flutter app

This guide is for the developer of the DME mobile app (Flutter, agents only). The backend side is done: every platform event creates an in-app notification and pushes it through Firebase Cloud Messaging (FCM) to every device the user registered. The app has three jobs:

1. Register its FCM token with the backend after login, and remove it on logout.
2. Show pushes and open the right screen when the user taps one.
3. Show the notification list (the "Accueil" screen) from the API.

Firebase project: **`orange-dme`**. Ask the backend team for access to the Firebase console.

## How it works

```
Manager assigns a visit
  └─ backend: MailService.assignmentCreated()
       ├─ email to the agent (if their preferences allow it)
       ├─ row in `notifications` (always, for an active account)
       └─ FCM push to every token in `device_tokens` for that agent
                └─ Firebase delivers it to the phone (app open, in background or closed)
```

- Pushes are sent for every notification, whatever the user's email preferences.
- Security events (password changed, account blocked...) are pushed too.
- Tokens that Firebase reports as dead (app uninstalled, token rotated) are deleted automatically by the backend.
- When a user is blocked or deleted, their tokens are deleted.

## 1. Firebase setup (once)

1. In the Firebase console (`orange-dme`), add an **Android app** with the app's package name (for example `tn.orange.dme`) and an **iOS app** with its bundle ID.
2. In the Flutter project, run `flutterfire configure --project=orange-dme`. It generates `lib/firebase_options.dart` and downloads `google-services.json` / `GoogleService-Info.plist`.
3. **iOS only:**
   - In Xcode, add the **Push Notifications** capability and **Background Modes > Remote notifications**.
   - Create an **APNs authentication key** (`.p8`) in the Apple Developer account. Upload it in the Firebase console: Project settings > Cloud Messaging > Apple app configuration. Without it, iOS receives nothing.
4. **Android 13+:** add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<application ...>
  <meta-data
      android:name="com.google.firebase.messaging.default_notification_channel_id"
      android:value="dme_notifications" />
</application>
```

## 2. Packages

```yaml
dependencies:
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.0.0 # shows pushes while the app is open (Android)
```

Use the latest versions; the snippets below follow these APIs and may need small adjustments.

## 3. Initialise, ask permission, create the Android channel

The backend sends every push on the Android channel **`dme_notifications`**. The app must create it, otherwise Android falls back to a generic channel.

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'firebase_options.dart';

const dmeChannel = AndroidNotificationChannel(
  'dme_notifications',
  'Notifications DME',
  description: 'Visites, rapports, tickets et sécurité du compte',
  importance: Importance.high,
);

final localNotifications = FlutterLocalNotificationsPlugin();

// Must be a top-level function.
@pragma('vm:entry-point')
Future<void> onBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // Nothing else to do: the system shows the notification itself.
}

Future<void> initPush() async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(onBackgroundMessage);

  await localNotifications
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(dmeChannel);

  await localNotifications.initialize(
    const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    ),
    onDidReceiveNotificationResponse: (response) =>
        openFromPayload(response.payload), // tap on a foreground notification
  );

  // iOS shows pushes in the foreground by itself with this.
  await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
    alert: true,
    badge: true,
    sound: true,
  );
}
```

Ask for permission **after login, with context** ("Recevoir les nouvelles visites et rappels ?"), not on the first screen:

```dart
final settings = await FirebaseMessaging.instance.requestPermission(
  alert: true,
  badge: true,
  sound: true,
);
final allowed =
    settings.authorizationStatus == AuthorizationStatus.authorized ||
    settings.authorizationStatus == AuthorizationStatus.provisional;
```

## 4. Register and remove the device

All routes need the usual `Authorization: Bearer <access token>` header.

| When | Call |
|---|---|
| After login, and on every app start while logged in | `POST /notifications/devices` with `{ "token": "<fcm token>", "platform": "ANDROID" \| "IOS" }` |
| When FCM rotates the token | the same call with the new token |
| On logout, **before** clearing the access token | `POST /notifications/devices/unregister` with `{ "token": "<fcm token>" }` |

Registering the same token again is safe: it refreshes it. If another user logs in on the same phone, registering moves the token to that user.

```dart
Future<void> registerDevice(ApiClient api) async {
  final messaging = FirebaseMessaging.instance;
  if (Platform.isIOS) {
    // getToken() fails on iOS until APNs has given the app its token.
    await messaging.getAPNSToken();
  }
  final token = await messaging.getToken();
  if (token == null) return;
  await api.post('/notifications/devices', {
    'token': token,
    'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
  });
  messaging.onTokenRefresh.listen((newToken) {
    api.post('/notifications/devices', {
      'token': newToken,
      'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
    });
  });
}

Future<void> unregisterDevice(ApiClient api) async {
  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) {
    await api.post('/notifications/devices/unregister', {'token': token});
  }
  await FirebaseMessaging.instance.deleteToken();
}
```

## 5. Receive and open

**What a push contains:**

```json
{
  "notification": {
    "title": "Visite imminente",
    "body": "Votre visite chez Sofrecom commence dans 1 heure."
  },
  "data": {
    "notificationId": "8f1c2a4e-…",
    "type": "VISIT_IMMINENT",
    "link": "/meetings",
    "entityType": "meeting",
    "entityId": "4d283bc1-…"
  },
  "android": { "priority": "high", "notification": { "channelId": "dme_notifications" } },
  "apns": { "payload": { "aps": { "badge": 3, "sound": "default" } } }
}
```

- `data` values are always strings; an absent value is `""`.
- `notificationId` is the bell entry to mark as read. It is **empty for push-only messages** (`DAILY_AGENDA`), which have no bell entry.
- `entityType` + `entityId` say which item it is about: open that item directly. `link` is the fallback screen.
- `aps.badge` is the user's unread count at send time.

**Handle the three cases:**

```dart
void listenToPushes() {
  // 1. App open: Android does not show it, so show it ourselves and refresh the badge.
  FirebaseMessaging.onMessage.listen((message) {
    final notification = message.notification;
    if (notification != null && Platform.isAndroid) {
      localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            dmeChannel.id,
            dmeChannel.name,
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        payload: jsonEncode(message.data),
      );
    }
    refreshUnreadCount(); // GET /notifications/unread-count
  });

  // 2. App in background, user taps the notification.
  FirebaseMessaging.onMessageOpenedApp.listen((m) => openFromData(m.data));

  // 3. App was closed, user taps the notification.
  FirebaseMessaging.instance.getInitialMessage().then((m) {
    if (m != null) openFromData(m.data);
  });
}

void openFromPayload(String? payload) {
  if (payload != null) openFromData(jsonDecode(payload) as Map<String, dynamic>);
}

void openFromData(Map<String, dynamic> data) {
  final id = data['notificationId'] as String? ?? '';
  if (id.isNotEmpty) api.patch('/notifications/$id/read'); // mark it read
  router.go(screenFor(
    entityType: data['entityType'] as String? ?? '',
    entityId: data['entityId'] as String? ?? '',
    link: data['link'] as String? ?? '',
  ));
}
```

**Open the exact item when there is one (`entityType`):**

| `entityType` | `entityId` | Screen in the app |
|---|---|---|
| `assignment` | assignment id | Assignment / visit details |
| `meeting` | meeting id | Visit details in the calendar |
| `visit_report` | **meeting id** (`GET /visit-reports/by-meeting/:meetingId`) | The visit report |
| `ticket` | ticket id | Ticket details |

If the item no longer exists (visit deleted, given to someone else), the API answers 403 or 404: fall back to `link`.

**Otherwise, use `link`:**

| `link` | Screen in the app |
|---|---|
| `/assignments` | Assigned visits |
| `/meetings` | Planning / calendar |
| `/visit-reports` | Visit reports ("Rapports") |
| `/tickets` | Tickets |
| `/settings` | Profile / settings |
| empty or unknown | Notifications list ("Accueil") |

## 6. The notification list ("Accueil")

The list is the same data as the web bell. Every route is scoped to the logged-in user.

| Method | Route | Use in the app |
|---|---|---|
| GET | `/notifications?limit=20&cursor=<id>` | The list, newest first. Pass `nextCursor` from the previous page to load more. Optional filters: `status=unread\|read`, `category=visits\|reports\|tickets\|security\|team\|data`, `q=<search>` |
| GET | `/notifications/unread-count` | "2 Nouveaux" and the home icon badge. Returns `{ "count": 2 }` |
| PATCH | `/notifications/:id/read` | When the user opens a notification |
| POST | `/notifications/read-all` | "Marquer tout comme lu" |
| DELETE | `/notifications/:id` | Swipe "Supprimer", after the confirmation dialog |
| POST | `/notifications/delete` | Delete several, `{ "ids": [...] }` (up to 100) |

Item shape:

```json
{
  "id": "8f1c2a4e-…",
  "type": "VISIT_IMMINENT",
  "title": "Visite imminente",
  "body": "Votre visite chez Sofrecom commence dans 1 heure.",
  "link": "/meetings",
  "entityType": "meeting",
  "entityId": "4d283bc1-…",
  "readAt": null,
  "createdAt": "2026-10-07T09:12:00.000Z"
}
```

- Group the list into "Aujourd'hui" / "Hier" / older from `createdAt`, and show relative times ("34 minutes", "1 Heure") on the app side.
- The home screen preview shows the first 2 items of `GET /notifications?limit=2`.
- On iOS the app icon badge comes from the last push. After the user reads notifications in the app, update it from `GET /notifications/unread-count` (for example with the `app_badge_plus` package).

## 7. What an agent receives

These are the notifications that reach agents (bell + push unless noted). The full catalog, including manager and admin notifications, is in [NOTIFICATIONS.md](NOTIFICATIONS.md).

**Visits**

| Type | When | Example | Entity |
|---|---|---|---|
| `ASSIGNMENT_CREATED` | A visit is assigned or reassigned to the agent | "Nouvelle visite assignée : Dataxion" | `assignment` |
| `ASSIGNMENT_RESCHEDULED` | Its date changes | "Visite reprogrammée : Dataxion" | `assignment` |
| `ASSIGNMENT_CANCELLED` | The manager cancels it | "La visite chez GlobalTech prévue le … a été annulée." | `assignment` |
| `ASSIGNMENT_REMOVED` | Deleted or given to another agent | "Visite retirée : Dataxion" | `assignment` |
| `MEETING_SCHEDULED` | The manager adds a meeting to the agent's planning | "Nouvelle visite planifiée : Sofrecom" | `meeting` |
| `MEETING_RESCHEDULED` | It is moved | "Visite reprogrammée : Sofrecom" | `meeting` |
| `MEETING_CANCELLED` | The manager cancels it | "La visite chez Sofrecom prévue le … a été annulée." | `meeting` |
| `MEETING_REMOVED` | Given to another agent | "Visite retirée : Sofrecom" | `meeting` |
| `VISIT_UPDATED` | The manager changes objectives, type, priority, place… without moving it | "Votre visite chez VERMEG a été mise à jour : les objectifs." | `assignment` / `meeting` |
| `VISIT_TOMORROW` | 18:00 the day before (reminder on) | "N'oubliez pas votre visite chez Sofrecom demain à 09:30." | `meeting` |
| `ASSIGNMENT_DUE_SOON` | 18:00 the day before (reminder on) | "L'assignation Dataxion arrive à échéance demain à 14:00." | `assignment` |
| `VISIT_IMMINENT` | About 1 hour before (reminder on) | "Votre visite chez Sofrecom commence dans 1 heure." | `assignment` / `meeting` |
| `ASSIGNMENT_OVERDUE` | 08:00 after a missed assignment date | "L'assignation Dataxion a dépassé son échéance (26 août)." | `assignment` |
| `DAILY_AGENDA` | 08:00 on days with visits. **Push only**, no bell entry | "Aujourd'hui : 3 visites, la première à 09:30 chez Sofrecom." | none |

**Reports**

| Type | When | Example | Entity |
|---|---|---|---|
| `REPORT_DUE` | 2 h after a visit with no submitted report, and again the next morning | "Pensez à compléter le compte rendu de votre visite chez Sofrecom." | `visit_report` |
| `VISIT_REPORT_VALIDATED` | The manager validates the report | "Compte rendu validé : Sigema" | `visit_report` |

**Tickets**

| Type | When | Entity |
|---|---|---|
| `TICKET_CREATED` | The agent's ticket was received | `ticket` |
| `TICKET_REPLIED` | An admin replied | `ticket` |
| `TICKET_STATUS_CHANGED` | Status changed ("Le problème sera bientôt résolu") | `ticket` |

**Security**: `NEW_DEVICE_LOGIN` (login from a new phone or browser), `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUIRED`, `ACCOUNT_UNBLOCKED`, `TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`. No entity.

Titles and bodies are written by the backend, in French.

### Mapping the Figma screen

| Figma item | Type(s) |
|---|---|
| "Nouvelle assignation" | `ASSIGNMENT_CREATED` |
| Visit cancelled ("La visite chez GlobalTech du 28 août a été annulée.") | `ASSIGNMENT_CANCELLED`, `MEETING_CANCELLED` |
| "Visite imminente" | `VISIT_IMMINENT` |
| "Rappel" | `VISIT_TOMORROW` (`ASSIGNMENT_DUE_SOON` for assignments) |
| "Rapport validé" | `VISIT_REPORT_VALIDATED`. The Figma body says "soumis avec succès", which is wrong for this event; the backend says "validé". |

## 8. Per-visit reminder ("Recevez un rappel 1 jour avant la visite")

The switch on the "Nouvelle visite" form is `reminderEnabled` (default `true`) on `POST /meetings`, `PATCH /meetings/:id`, `POST /assignments` and `PATCH /assignments/:id`. Agents can change it on their own visits. Meetings and assignments return it as `reminder_enabled`.

When it is off, that visit gets no "Rappel" the day before, no "Visite imminente", and is left out of the evening email.

## 9. Testing

1. **One device:** log in on a test phone and check that a row appears in `device_tokens`. Then send a test message from the Firebase console (Messaging > New campaign > Send test message) with that token.
2. **Real events:** as a manager on the web app, assign a visit to the test agent. The phone should show "Nouvelle visite assignée : …" within a few seconds, with the app open, in the background, and closed.
3. **Taps:** tap the push in each of the three states and check that the app opens that assignment's details and that the item becomes read.
4. **Reminders:** create a meeting for the test agent starting in 50 minutes: "Visite imminente" arrives within 5 minutes. Turn its reminder off and create another one: nothing arrives.
5. **Logout:** after logging out, the token must disappear from `device_tokens` and pushes must stop.

**If nothing arrives:**
- **Android:** the notification permission was refused, or the channel is missing.
- **iOS:** the APNs key isn't uploaded to Firebase, or the capabilities are missing. Test on a real iPhone: simulator support for remote pushes is limited.
- **Backend:** check its logs for `Push "..." failed`.

## Notes

- Firebase is moving from registration tokens to Firebase Installation IDs (FIDs). Tokens still work and are what `firebase_messaging` returns today. The backend will add FID support when the Flutter SDK switches.
- Scheduled notifications are sent once: the backend records each one in `scheduled_notification_log`.
- There is no per-type push preference yet: users can only turn notifications off in the phone's settings. Per-type email switches exist (`PATCH /users/me/notification-preferences`); push switches can be added the same way if the Figma needs them.
