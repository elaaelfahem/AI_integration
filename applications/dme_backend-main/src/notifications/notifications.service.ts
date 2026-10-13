import { Injectable, NotFoundException } from '@nestjs/common';
import type { DevicePlatform, Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationEntity,
} from './notification.types';

const DEFAULT_PAGE_SIZE = 20;

export interface NotificationFilters {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: 'all' | 'unread' | 'read';
  category?: NotificationCategory;
}

export interface NewNotification {
  type: string;
  title: string;
  body: string;
  link?: string | null;
  entity?: NotificationEntity | null;
}

/**
 * In-app notifications (the bell) and the devices registered for push.
 * Notifications are created by MailService alongside each event email.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Stores the bell entry, then pushes it to the account's devices. */
  async create(accountId: string, notification: NewNotification) {
    const row = await this.prisma.notification.create({
      data: {
        account_id: accountId,
        type: notification.type,
        title: notification.title.slice(0, 200),
        body: notification.body.slice(0, 1000),
        link: notification.link ?? null,
        entity_type: notification.entity?.type ?? null,
        entity_id: notification.entity?.id ?? null,
      },
    });
    void this.push.sendToAccount(accountId, {
      notificationId: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      entityType: row.entity_type,
      entityId: row.entity_id,
    });
    return row;
  }

  async list(accountId: string, filters: NotificationFilters = {}) {
    const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
    const where = filterWhere(accountId, filters);
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
      }),
      this.prisma.notification.count({ where }),
      this.unreadCount(accountId),
    ]);
    const items = rows.slice(0, limit);

    return {
      items: items.map(toView),
      nextCursor: rows.length > limit ? items[items.length - 1].id : null,
      total,
      unreadCount,
    };
  }

  async markManyRead(accountId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { account_id: accountId, id: { in: ids }, read_at: null },
      data: { read_at: new Date() },
    });
    return { unreadCount: await this.unreadCount(accountId) };
  }

  async remove(accountId: string, id: string) {
    const deleted = await this.prisma.notification.deleteMany({
      where: { id, account_id: accountId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return { deleted: 1, unreadCount: await this.unreadCount(accountId) };
  }

  async removeMany(accountId: string, ids: string[]) {
    const deleted = await this.prisma.notification.deleteMany({
      where: { account_id: accountId, id: { in: ids } },
    });
    return {
      deleted: deleted.count,
      unreadCount: await this.unreadCount(accountId),
    };
  }

  async removeRead(accountId: string) {
    const deleted = await this.prisma.notification.deleteMany({
      where: { account_id: accountId, read_at: { not: null } },
    });
    return {
      deleted: deleted.count,
      unreadCount: await this.unreadCount(accountId),
    };
  }

  unreadCount(accountId: string) {
    return this.prisma.notification.count({
      where: { account_id: accountId, read_at: null },
    });
  }

  async markRead(accountId: string, id: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, account_id: accountId, read_at: null },
      data: { read_at: new Date() },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.notification.count({
        where: { id, account_id: accountId },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { unreadCount: await this.unreadCount(accountId) };
  }

  async markAllRead(accountId: string) {
    await this.prisma.notification.updateMany({
      where: { account_id: accountId, read_at: null },
      data: { read_at: new Date() },
    });
    return { unreadCount: 0 };
  }

  /** A token moves to the account that registers it last (shared browser). */
  async registerDevice(
    accountId: string,
    token: string,
    platform: DevicePlatform,
    userAgent?: string,
  ) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: {
        account_id: accountId,
        token,
        platform,
        user_agent: userAgent?.slice(0, 500),
      },
      update: {
        account_id: accountId,
        platform,
        user_agent: userAgent?.slice(0, 500),
        last_seen_at: new Date(),
      },
    });
    return { registered: true as const };
  }

  async unregisterDevice(accountId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { account_id: accountId, token },
    });
    return { unregistered: true as const };
  }

  deviceTokens(accountId: string) {
    return this.prisma.deviceToken.findMany({
      where: { account_id: accountId },
      select: { token: true, platform: true },
    });
  }
}

function filterWhere(
  accountId: string,
  { q, status, category }: NotificationFilters,
): Prisma.NotificationWhereInput {
  const search = q?.trim();
  return {
    account_id: accountId,
    ...(status === 'unread' && { read_at: null }),
    ...(status === 'read' && { read_at: { not: null } }),
    ...(category && {
      type: { in: [...NOTIFICATION_CATEGORIES[category]] },
    }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };
}

function toView(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    readAt: notification.read_at?.toISOString() ?? null,
    createdAt: notification.created_at.toISOString(),
  };
}
