import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersCompaniesService } from './users-companies.service';

const NOW = new Date('2026-10-07T09:00:00Z');

function setup(user: Record<string, unknown> | null) {
  const visit = (id: string, at: string, status: string) => ({
    id,
    agent_id: 'agent',
    manager_id: 'boss',
    company_id: 'c1',
    company: { id: 'c1', name: 'Sigema', address: null, governorate: null },
    scheduled_at: new Date(at),
    duration_minutes: 60,
    status,
    visit_type: 'FIRST_VISIT',
    reminder_enabled: true,
  });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    prospectingMeeting: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          visit('m1', '2026-09-01T09:00:00Z', 'COMPLETED'),
          visit('m2', '2026-10-20T09:00:00Z', 'SCHEDULED'),
        ]),
    },
    assignment: { findMany: jest.fn().mockResolvedValue([]) },
    company: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          name: 'Sigema',
          sector: 'Industrie',
          governorate: 'Sfax',
          address: null,
          status: 'ACTIVE',
          ai_score: 82,
          client_category: 'GOLD',
        },
      ]),
    },
  };
  return { prisma, service: new UsersCompaniesService(prisma as never) };
}

describe('UsersCompaniesService', () => {
  const agent = {
    id: 'agent',
    role: 'AGENT',
    manager_id: 'boss',
    status: 'ACTIVE',
  };

  it("lists an agent's visited companies with visit stats", async () => {
    const { service } = setup(agent);

    const result = await service.list('boss', 'MANAGER', 'agent', NOW);

    expect(result.relation).toBe('VISITS');
    expect(result.companies[0]).toEqual(
      expect.objectContaining({
        id: 'c1',
        aiScore: 82,
        visits: { total: 2, completed: 1, upcoming: 1 },
        lastVisitAt: '2026-09-01T09:00:00.000Z',
        nextVisitAt: '2026-10-20T09:00:00.000Z',
      }),
    );
  });

  it('lists the companies a manager manages', async () => {
    const { service, prisma } = setup({
      id: 'boss',
      role: 'MANAGER',
      manager_id: null,
      status: 'ACTIVE',
    });

    const result = await service.list('boss', 'MANAGER', 'boss', NOW);

    expect(result.relation).toBe('MANAGED');
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { manager_id: 'boss', status: 'ACTIVE' },
      }),
    );
  });

  it('refuses another manager’s agent and other agents', async () => {
    await expect(
      setup(agent).service.list('other-boss', 'MANAGER', 'agent', NOW),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      setup(agent).service.list('other-agent', 'AGENT', 'agent', NOW),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s on unknown or deleted users', async () => {
    await expect(
      setup(null).service.list('s', 'SUPERADMIN', 'x', NOW),
    ).rejects.toThrow(NotFoundException);
  });
});
