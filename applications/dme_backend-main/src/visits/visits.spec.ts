import {
  findVisits,
  tunisDay,
  tunisMonth,
  tunisWeek,
  visitScopeFor,
} from './visits';

describe('visits helpers', () => {
  it('computes Tunis day, week and month boundaries (UTC+1)', () => {
    // Wednesday 7 October 2026, 00:30 in Tunis = 6 Oct 23:30 UTC
    const now = new Date('2026-10-06T23:30:00Z');
    expect(tunisDay(now).start.toISOString()).toBe('2026-10-06T23:00:00.000Z');
    expect(tunisDay(now, 1).start.toISOString()).toBe(
      '2026-10-07T23:00:00.000Z',
    );
    expect(tunisWeek(now).start.toISOString()).toBe('2026-10-04T23:00:00.000Z'); // Monday 5 Oct
    expect(tunisMonth('2026-12')).toEqual({
      start: new Date('2026-11-30T23:00:00.000Z'),
      end: new Date('2026-12-31T23:00:00.000Z'),
    });
  });

  it('scopes by role', () => {
    expect(visitScopeFor('a', 'AGENT')).toEqual({ agentId: 'a' });
    expect(visitScopeFor('m', 'MANAGER')).toEqual({ managerId: 'm' });
    expect(visitScopeFor('s', 'SUPERADMIN')).toEqual({});
  });

  it('merges meetings and assignments, listing a duplicate visit once', async () => {
    const row = (id: string, at: string, companyId = 'c1') => ({
      id,
      agent_id: 'a',
      manager_id: 'm',
      company_id: companyId,
      company: { id: companyId, name: 'X', address: null, governorate: null },
      scheduled_at: new Date(at),
      duration_minutes: 60,
      status: 'SCHEDULED',
      visit_type: 'FIRST_VISIT',
      priority: 'HIGH',
      reminder_enabled: true,
    });
    const prisma = {
      prospectingMeeting: {
        findMany: jest
          .fn()
          .mockResolvedValue([row('m1', '2026-10-08T09:00:00Z')]),
      },
      assignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            row('a-dup', '2026-10-08T09:00:00Z'),
            row('a2', '2026-10-07T09:00:00Z', 'c2'),
          ]),
      },
    };

    const visits = await findVisits(prisma as never, {
      scope: { agentId: 'a' },
      from: new Date('2026-10-07T00:00:00Z'),
    });

    expect(visits.map((v) => `${v.kind}:${v.id}`)).toEqual([
      'assignment:a2',
      'meeting:m1',
    ]);
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agent_id: 'a',
          scheduled_at: { gte: new Date('2026-10-07T00:00:00Z') },
        }),
      }),
    );
  });
});
