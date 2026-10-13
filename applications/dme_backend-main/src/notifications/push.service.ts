import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

const FIREBASE_APP_NAME = 'dme';

/** FCM refuses these tokens for good: the app was uninstalled or the token rotated. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Android channel the mobile app must create (see MOBILE_NOTIFICATIONS.md). */
export const ANDROID_CHANNEL_ID = 'dme_notifications';

export interface PushPayload {
  /** Empty for push-only messages, which are not stored. */
  notificationId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Sends Firebase Cloud Messaging pushes to every device of an account.
 * Without FIREBASE_SERVICE_ACCOUNT it stays disabled and sends nothing.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const encoded = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!encoded) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT is not set: push disabled');
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8'),
      ) as Record<string, string>;
      const app =
        getApps().find((existing) => existing.name === FIREBASE_APP_NAME) ??
        initializeApp(
          {
            credential: cert({
              projectId: serviceAccount.project_id,
              clientEmail: serviceAccount.client_email,
              privateKey: serviceAccount.private_key,
            }),
          },
          FIREBASE_APP_NAME,
        );
      this.messaging = getMessaging(app);
    } catch (error) {
      this.logger.error(
        'FIREBASE_SERVICE_ACCOUNT is not a valid base64 service account JSON: push disabled',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  get enabled() {
    return this.messaging !== null;
  }

  /** Returns how many devices accepted the push. Never throws. */
  async sendToAccount(accountId: string, payload: PushPayload) {
    if (!this.messaging) return 0;
    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { account_id: accountId },
        select: { token: true },
      });
      if (devices.length === 0) return 0;
      const tokens = devices.map((device) => device.token);
      const badge = await this.prisma.notification.count({
        where: { account_id: accountId, read_at: null },
      });

      const response = await this.messaging.sendEachForMulticast(
        this.buildMessage(tokens, payload, badge),
      );

      const dead = response.responses
        .map((result, index) =>
          !result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? '')
            ? tokens[index]
            : null,
        )
        .filter((token): token is string => token !== null);
      if (dead.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: dead } },
        });
      }
      for (const result of response.responses) {
        if (
          !result.success &&
          !DEAD_TOKEN_CODES.has(result.error?.code ?? '')
        ) {
          this.logger.warn(
            `Push "${payload.type}" failed: ${result.error?.code} ${result.error?.message}`,
          );
        }
      }
      return response.successCount;
    } catch (error) {
      this.logger.error(
        `Push "${payload.type}" could not be sent`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }

  buildMessage(tokens: string[], payload: PushPayload, badge: number) {
    const frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    // FCM only accepts HTTPS click links for web push.
    const webLink =
      payload.link && frontendUrl.startsWith('https://')
        ? `${frontendUrl}${payload.link}`
        : undefined;

    return {
      tokens,
      notification: { title: payload.title, body: payload.body },
      // Data values must be strings. The app routes on `type` and `link`.
      data: {
        notificationId: payload.notificationId,
        type: payload.type,
        link: payload.link ?? '',
        entityType: payload.entityType ?? '',
        entityId: payload.entityId ?? '',
      },
      android: {
        priority: 'high' as const,
        notification: { channelId: ANDROID_CHANNEL_ID },
      },
      apns: {
        payload: { aps: { badge, sound: 'default' } },
      },
      webpush: webLink ? { fcmOptions: { link: webLink } } : undefined,
    };
  }
}
