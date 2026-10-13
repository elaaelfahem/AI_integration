import { MeDashboardService } from './me-dashboard.service';

const NOW = new Date('2026-10-07T09:00:00Z');
const company = (id: string) => ({
  id,
  name: `Company ${id}`,
  address: null,
  governorate: 'Tunis',
});

describe('MeDashboardService', () => {
  it('builds the agent home screen', async () => {
    const meetings = [
      // past, completed
      {
        id: 'm1',
        agent_id: 'me',
        manager_id: 'boss',
        company_id: 'c1',
        company: company('c1'),
        scheduled_at: new Date('2026-10-01T09:00:00Z'),
        duration_minutes: 60,
        status: 'COMPLETED',
        visit_type: 'FIRST_VISIT',
        reminder_enabled: true,
      },
      // upcoming
      {
        id: 'm2',
        agent_id: 'me',
        manager_id: 'boss',
        company_id: 'c2',
        company: company('c2'),
        scheduled_at: new Date('2026-10-08T09:00:00Z'),
        duration_minutes: 60,
        status: 'SCHEDULED',
        visit_type: 'FOLLOW_UP',
        reminder_enabled: true,
      },
    ];
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ first_name: 'Yassine', last_name: 'K' }),
      },
      prospectingMeeting: {
        findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          // reportsToComplete query: past meetings without a submitted report
          if ('OR' in where) {
            return Promise.resolve([
              {
                scheduled_at: new Date('2026-10-01T09:00:00Z'),
                duration_minutes: 60,
              },
            ]);
          }
          const from = (where.scheduled_at as { gte?: Date } | undefined)?.gte;
          return Promise.resolve(
            from ? meetings.filter((m) => m.scheduled_at >= from) : meetings,
          );
        }),
      },
      assignment: {
        // The open-assignments list is the only query with a take limit.
        findMany: jest.fn(({ take }: { take?: number }) =>
          Promise.resolve(
            take
              ? [
                  {
                    id: 'a1',
                    company: { id: 'c3', name: 'Dataxion' },
                    scheduled_at: new Date('2026-10-26T09:00:00Z'),
                    status: 'ASSIGNED',
                    priority: 'HIGH',
                  },
                ]
              : [],
          ),
        ),
      },
      notification: { count: jest.fn().mockResolvedValue(2) },
    };

    const home = await new MeDashboardService(prisma as never).get('me', NOW);

    expect(home.firstName).toBe('Yassine');
    expect(home.kpis).toEqual({
      plannedVisits: 1,
      totalVisits: 2,
      assignedCompanies: 2,
      reportsToComplete: 1,
    });
    expect(home.nextVisit).toEqual(
      expect.objectContaining({ kind: 'meeting', id: 'm2' }),
    );
    expect(home.assignments[0]).toEqual(
      expect.objectContaining({
        id: 'a1',
        status: 'ASSIGNED',
        priority: 'HIGH',
      }),
    );
    expect(home.unreadNotifications).toBe(2);
  });
});
