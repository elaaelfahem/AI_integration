import { Prisma } from '@prisma/client';
import { MailService } from './mail.service';

/** 2026-10-07 10:00 in Tunis (UTC+1). */
const NOW = new Date('2026-10-07T09:00:00Z');
const at = (iso: string) => new Date(iso);

const agentAccount = {
  account_type: 'USER',
  user: {
    email: 'agent@orange.com',
    first_name: 'Sami',
    last_name: 'Ben Ali',
    role: 'AGENT',
    status: 'ACTIVE',
    notify_work_updates: true,
    notify_analysis_results: true,
    email_opt_outs: [],
  },
  superadmin: null,
};

function setup() {
  const claimed = new Set<string>();
  const prisma = {
    account: { findUnique: jest.fn().mockResolvedValue(agentAccount) },
    prospectingMeeting: { findMany: jest.fn().mockResolvedValue([]) },
    assignment: { findMany: jest.fn().mockResolvedValue([]) },
    connectionEvent: { findMany: jest.fn().mockResolvedValue([]) },
    scheduledNotificationLog: {
      create: jest.fn(({ data }: { data: Record<string, string> }) => {
        const key = Object.values(data).join('|');
        if (claimed.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        claimed.add(key);
        return Promise.resolve(data);
      }),
    },
  };
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const createNotification = jest.fn().mockResolvedValue({ id: 'n1' });
  const pushToAccount = jest.fn().mockResolvedValue(1);
  const service = new MailService(
    { sendMail } as never,
    prisma as never,
    { get: (_: string, fallback: string) => fallback } as never,
    { create: createNotification } as never,
    { sendToAccount: pushToAccount } as never,
  );
  const bell = () =>
    createNotification.mock.calls.map(
      ([, n]: [string, { type: string; body: string }]) => n,
    );
  return { service, prisma, sendMail, createNotification, pushToAccount, bell };
}

const meeting = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  agent_id: 'agent-id',
  manager_id: 'manager-id',
  company_id: 'c1',
  company: { name: 'Sofrecom', address: 'Les Berges du Lac' },
  scheduled_at: at('2026-10-08T08:30:00Z'), // tomorrow 09:30 Tunis
  duration_minutes: 60,
  ...overrides,
});

describe('MailService reminders', () => {
  it('evening: one email per agent and one bell/push per visit, once', async () => {
    const { service, prisma, sendMail, bell } = setup();
    prisma.prospectingMeeting.findMany.mockResolvedValue([meeting()]);
    prisma.assignment.findMany.mockResolvedValue([
      // Same visit stored as an assignment too: listed once.
      { ...meeting({ id: 'a-dup' }) },
      meeting({
        id: 'a2',
        company_id: 'c2',
        company: { name: 'Dataxion', address: null },
        scheduled_at: at('2026-10-08T13:00:00Z'),
      }),
    ]);

    await service.sendVisitReminders(NOW);
    await service.sendVisitReminders(NOW);

    expect(sendMail).toHaveBeenCalledTimes(2); // the digest is not deduplicated
    expect(sendMail.mock.calls[0][0].subject).toBe('Rappel : 2 visites demain');
    expect(bell()).toEqual([
      expect.objectContaining({
        type: 'VISIT_TOMORROW',
        body: 'N’oubliez pas votre visite chez Sofrecom demain à 09:30.',
      }),
      expect.objectContaining({
        type: 'ASSIGNMENT_DUE_SOON',
        body: 'L’assignation Dataxion arrive à échéance demain à 14:00.',
      }),
    ]);
    expect(prisma.prospectingMeeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reminder_enabled: true }),
      }),
    );
  });

  it('imminent: bell + push, no email, once per visit', async () => {
    const { service, prisma, sendMail, bell } = setup();
    prisma.prospectingMeeting.findMany.mockResolvedValue([
      meeting({ scheduled_at: new Date(NOW.getTime() + 58 * 60_000) }),
      meeting({
        id: 'm2',
        company_id: 'c2',
        company: { name: 'VERMEG', address: null },
        scheduled_at: new Date(NOW.getTime() + 31 * 60_000),
      }),
    ]);

    await service.sendImminentVisitReminders(NOW);
    await service.sendImminentVisitReminders(NOW);

    expect(sendMail).not.toHaveBeenCalled();
    expect(bell().map((n) => n.body)).toEqual([
      'Votre visite chez VERMEG commence dans 30 minutes.',
      'Votre visite chez Sofrecom commence dans 1 heure.',
    ]);
  });

  it('report due: 2 h after the visit ends, then the next morning', async () => {
    const { service, prisma, bell } = setup();
    prisma.prospectingMeeting.findMany.mockResolvedValue([
      // Ended at 06:30 UTC, 2.5 h before NOW.
      meeting({ scheduled_at: at('2026-10-07T05:30:00Z') }),
      // Ended 1 h ago: too early.
      meeting({ id: 'm2', scheduled_at: at('2026-10-07T07:00:00Z') }),
      // Yesterday morning, ended 27 h ago: only the next-morning reminder.
      meeting({ id: 'm3', scheduled_at: at('2026-10-06T05:00:00Z') }),
    ]);

    await service.sendReportDueReminders('after-visit', NOW);
    expect(bell()).toHaveLength(1);
    expect(bell()[0]).toEqual(
      expect.objectContaining({
        type: 'REPORT_DUE',
        entity: { type: 'visit_report', id: 'm1' },
      }),
    );

    await service.sendReportDueReminders('next-morning', NOW);
    expect(
      bell().map((n) => (n as unknown as { entity: { id: string } }).entity.id),
    ).toEqual(['m1', 'm3']);
  });

  it('overdue: once per assignment, the morning after', async () => {
    const { service, prisma, bell } = setup();
    prisma.assignment.findMany.mockResolvedValue([
      meeting({
        id: 'a1',
        company: { name: 'Dataxion', address: null },
        scheduled_at: at('2026-10-06T09:00:00Z'),
      }),
    ]);

    await service.sendOverdueAssignments(NOW);
    await service.sendOverdueAssignments(NOW);

    expect(bell()).toEqual([
      expect.objectContaining({
        type: 'ASSIGNMENT_OVERDUE',
        body: 'L’assignation Dataxion a dépassé son échéance (6 octobre).',
      }),
    ]);
  });

  it('daily agenda is push only', async () => {
    const { service, prisma, sendMail, createNotification, pushToAccount } =
      setup();
    prisma.prospectingMeeting.findMany.mockResolvedValue([
      meeting({ scheduled_at: at('2026-10-07T08:30:00Z') }),
      meeting({
        id: 'm2',
        company_id: 'c2',
        scheduled_at: at('2026-10-07T13:00:00Z'),
      }),
    ]);

    await service.sendDailyAgenda(NOW);

    expect(sendMail).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(pushToAccount).toHaveBeenCalledWith(
      'agent-id',
      expect.objectContaining({
        notificationId: '',
        type: 'DAILY_AGENDA',
        body: 'Aujourd’hui : 2 visites, la première à 09:30 chez Sofrecom.',
      }),
    );
  });

  describe('new device login', () => {
    const chromeOnWindows =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
    const safariOnIphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    it('alerts on a device never seen before', async () => {
      const { service, prisma, sendMail, bell } = setup();
      prisma.connectionEvent.findMany.mockResolvedValue([
        { user_agent: chromeOnWindows },
      ]);

      await service.newDeviceLogin(
        'agent-id',
        safariOnIphone,
        '41.226.1.1',
        NOW,
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(bell()[0]).toEqual(
        expect.objectContaining({
          type: 'NEW_DEVICE_LOGIN',
          body: 'Nouvelle connexion à votre compte depuis iPhone (Safari 17).',
        }),
      );
    });

    it('stays quiet for a known device or a first login', async () => {
      const { service, prisma, sendMail } = setup();
      prisma.connectionEvent.findMany.mockResolvedValueOnce([
        { user_agent: chromeOnWindows },
      ]);
      await service.newDeviceLogin('agent-id', chromeOnWindows, undefined, NOW);

      prisma.connectionEvent.findMany.mockResolvedValueOnce([]);
      await service.newDeviceLogin('agent-id', safariOnIphone, undefined, NOW);

      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});

describe('MailService visit updates', () => {
  it('tells the agent which details of the visit changed', async () => {
    const { service, prisma, bell } = setup();
    const after = {
      ...meeting({ id: 'a1' }),
      visit_type: 'FIRST_VISIT',
      priority: 'HIGH',
      objectives: 'Présenter SD-WAN',
      status: 'ASSIGNED',
      cancellation_reason: null,
    };
    Object.assign(prisma.assignment, {
      findUnique: jest.fn().mockResolvedValue(after),
    });

    await service.assignmentChanged({
      ...after,
      objectives: 'Présenter Cloud Pro',
      priority: 'LOW',
    } as never);

    expect(bell()).toEqual([
      expect.objectContaining({
        type: 'VISIT_UPDATED',
        body: 'Votre visite chez Sofrecom a été mise à jour : les objectifs et la priorité.',
        entity: { type: 'assignment', id: 'a1' },
      }),
    ]);
  });
});
