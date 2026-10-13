import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

const row = (id: string, readAt: Date | null = null) => ({
  id,
  account_id: 'me',
  type: 'ASSIGNMENT_CREATED',
  title: `Title ${id}`,
  body: 'Body',
  link: '/assignments',
  entity_type: null,
  entity_id: null,
  read_at: readAt,
  created_at: new Date('2026-10-06T10:00:00Z'),
});

describe('NotificationsService', () => {
  let prisma: {
    notification: Record<string, jest.Mock>;
    deviceToken: Record<string, jest.Mock>;
  };
  let service: NotificationsService;
  let push: { sendToAccount: jest.Mock };

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      deviceToken: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    push = { sendToAccount: jest.fn().mockResolvedValue(1) };
    service = new NotificationsService(prisma as never, push as never);
  });

  it('pushes every new notification to the account devices', async () => {
    prisma.notification.create.mockResolvedValue(row('new-id'));

    await service.create('me', {
      type: 'ASSIGNMENT_CREATED',
      title: 'Title new-id',
      body: 'Body',
      link: '/assignments',
    });

    expect(push.sendToAccount).toHaveBeenCalledWith('me', {
      notificationId: 'new-id',
      type: 'ASSIGNMENT_CREATED',
      title: 'Title new-id',
      body: 'Body',
      link: '/assignments',
      entityType: null,
      entityId: null,
    });
  });

  it('pages with a cursor and reports the next one', async () => {
    prisma.notification.findMany.mockResolvedValue([
      row('a'),
      row('b'),
      row('c'),
    ]);

    const page = await service.list('me', { limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
    expect(page.unreadCount).toBe(3);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { account_id: 'me' }, take: 3 }),
    );
  });

  it('returns no cursor on the last page', async () => {
    prisma.notification.findMany.mockResolvedValue([row('a')]);

    const page = await service.list('me', { cursor: 'previous-id', limit: 2 });

    expect(page.nextCursor).toBeNull();
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'previous-id' }, skip: 1 }),
    );
  });

  it('combines search, status and category filters', async () => {
    prisma.notification.findMany.mockResolvedValue([]);

    const page = await service.list('me', {
      q: '  sigema ',
      status: 'unread',
      category: 'reports',
    });

    const where = {
      account_id: 'me',
      read_at: null,
      type: {
        in: [
          'VISIT_REPORT_SUBMITTED',
          'VISIT_REPORT_VALIDATED',
          'VISIT_REPORT_NOTE_ADDED',
          'REPORT_ANALYZED',
          'WEEKLY_DIGEST',
          'REPORT_DUE',
        ],
      },
      OR: [
        { title: { contains: 'sigema', mode: 'insensitive' } },
        { body: { contains: 'sigema', mode: 'insensitive' } },
      ],
    };
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(prisma.notification.count).toHaveBeenCalledWith({ where });
    expect(page.total).toBe(3);
  });

  it('filters read notifications', async () => {
    prisma.notification.findMany.mockResolvedValue([]);

    await service.list('me', { status: 'read' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account_id: 'me', read_at: { not: null } },
      }),
    );
  });

  it("only deletes the caller's own notifications", async () => {
    const result = await service.removeMany('me', ['a', 'b']);

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 'me', id: { in: ['a', 'b'] } },
    });
    expect(result).toEqual({ deleted: 2, unreadCount: 3 });
  });

  it('404s when deleting a notification that is not the callers', async () => {
    prisma.notification.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.remove('me', 'other')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes only read notifications on "delete read"', async () => {
    await service.removeRead('me');

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 'me', read_at: { not: null } },
    });
  });

  it("only marks the caller's own notification as read", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.count.mockResolvedValueOnce(0);

    await expect(service.markRead('me', 'someone-elses')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses', account_id: 'me', read_at: null },
      data: { read_at: expect.any(Date) },
    });
  });

  it('moves a shared browser token to the account that registers it', async () => {
    await service.registerDevice('me', 'fcm-token', 'WEB', 'Chrome');

    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'fcm-token' },
      create: {
        account_id: 'me',
        token: 'fcm-token',
        platform: 'WEB',
        user_agent: 'Chrome',
      },
      update: {
        account_id: 'me',
        platform: 'WEB',
        user_agent: 'Chrome',
        last_seen_at: expect.any(Date),
      },
    });
  });

  it("only removes the caller's own device token", async () => {
    await service.unregisterDevice('me', 'fcm-token');

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 'me', token: 'fcm-token' },
    });
  });
});
