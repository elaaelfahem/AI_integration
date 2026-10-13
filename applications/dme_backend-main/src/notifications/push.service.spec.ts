import { ANDROID_CHANNEL_ID, PushService } from './push.service';

const payload = {
  notificationId: 'n1',
  type: 'ASSIGNMENT_CREATED',
  title: 'Nouvelle visite assignée : Sigema',
  body: 'Une visite chez Sigema vous a été assignée.',
  link: '/assignments',
  entityType: 'assignment',
  entityId: 'a1',
};

function setup(frontendUrl = 'http://localhost:3000') {
  const prisma = {
    deviceToken: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { token: 'phone-token' },
          { token: 'old-token' },
          { token: 'browser-token' },
        ]),
      deleteMany: jest.fn(),
    },
    notification: { count: jest.fn().mockResolvedValue(4) },
  };
  const config = {
    get: (key: string, fallback?: string) =>
      key === 'FRONTEND_URL' ? frontendUrl : fallback,
  };
  const service = new PushService(prisma as never, config as never);
  const sendEachForMulticast = jest.fn().mockResolvedValue({
    successCount: 1,
    failureCount: 2,
    responses: [
      { success: true },
      {
        success: false,
        error: { code: 'messaging/registration-token-not-registered' },
      },
      { success: false, error: { code: 'messaging/internal-error' } },
    ],
  });
  (service as unknown as { messaging: unknown }).messaging = {
    sendEachForMulticast,
  };
  return { service, prisma, sendEachForMulticast };
}

describe('PushService', () => {
  it('stays disabled without a service account', async () => {
    const service = new PushService(
      {} as never,
      {
        get: () => undefined,
      } as never,
    );
    service.onModuleInit();

    expect(service.enabled).toBe(false);
    await expect(service.sendToAccount('me', payload)).resolves.toBe(0);
  });

  it('sends to every device with the routing data and the badge', async () => {
    const { service, sendEachForMulticast } = setup();

    const sent = await service.sendToAccount('me', payload);

    expect(sent).toBe(1);
    const message = sendEachForMulticast.mock.calls[0][0];
    expect(message.tokens).toEqual([
      'phone-token',
      'old-token',
      'browser-token',
    ]);
    expect(message.notification).toEqual({
      title: payload.title,
      body: payload.body,
    });
    expect(message.data).toEqual({
      notificationId: 'n1',
      type: 'ASSIGNMENT_CREATED',
      link: '/assignments',
      entityType: 'assignment',
      entityId: 'a1',
    });
    expect(message.android.notification.channelId).toBe(ANDROID_CHANNEL_ID);
    expect(message.apns.payload.aps.badge).toBe(4);
  });

  it('deletes only the tokens FCM says are dead', async () => {
    const { service, prisma } = setup();

    await service.sendToAccount('me', payload);

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['old-token'] } },
    });
  });

  it('adds a web click link only for an HTTPS frontend', () => {
    const local = setup().service.buildMessage(['t'], payload, 0);
    const prod = setup('https://dme.orange.tn').service.buildMessage(
      ['t'],
      payload,
      0,
    );

    expect(local.webpush).toBeUndefined();
    expect(prod.webpush).toEqual({
      fcmOptions: { link: 'https://dme.orange.tn/assignments' },
    });
  });

  it('skips accounts without devices', async () => {
    const { service, prisma, sendEachForMulticast } = setup();
    prisma.deviceToken.findMany.mockResolvedValue([]);

    await expect(service.sendToAccount('me', payload)).resolves.toBe(0);
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('never throws when Firebase fails', async () => {
    const { service, sendEachForMulticast } = setup();
    sendEachForMulticast.mockRejectedValue(new Error('network down'));

    await expect(service.sendToAccount('me', payload)).resolves.toBe(0);
  });
});
