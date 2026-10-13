import { BadRequestException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

describe('CompaniesService', () => {
  const managerId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  let prisma: {
    company: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    account: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      company: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: companyId }),
        create: jest.fn().mockResolvedValue({ id: companyId }),
        update: jest.fn().mockResolvedValue({ id: companyId }),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue({ id: managerId }),
      },
    };
  });

  it('limits manager company lists to companies owned by that manager', async () => {
    await new CompaniesService(prisma as never).list(managerId, 'MANAGER');

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ status: 'ACTIVE', manager_id: managerId }] },
      }),
    );
  });

  it('filters companies an agent visited, and flags them', async () => {
    prisma.company.findMany.mockResolvedValue([{ id: 'c1' }]);

    const rows = await new CompaniesService(prisma as never).list(
      'agent-id',
      'AGENT',
      'true',
    );

    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({
      OR: [
        { meetings: { some: { agent_id: 'agent-id', status: 'COMPLETED' } } },
        {
          assignments: { some: { agent_id: 'agent-id', status: 'COMPLETED' } },
        },
        {
          prospections: {
            some: { agent_id: 'agent-id', visited_at: { not: null } },
          },
        },
      ],
    });
    expect(rows).toEqual([{ id: 'c1', visited: true }]);
  });

  it('lists never-visited companies with visited=false', async () => {
    await new CompaniesService(prisma as never).list(
      managerId,
      'MANAGER',
      'false',
    );

    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({
      NOT: expect.objectContaining({ OR: expect.any(Array) }),
    });
  });

  it('adds a visited flag when no filter is given', async () => {
    prisma.company.findMany
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }])
      .mockResolvedValueOnce([{ id: 'c2' }]);

    const rows = await new CompaniesService(prisma as never).list(
      managerId,
      'MANAGER',
    );

    expect(rows.map((row) => row.visited)).toEqual([false, true]);
  });

  it('validates the manager when a company is created', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      new CompaniesService(prisma as never).create('admin-id', {
        name: 'Example company',
        managerId,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it('persists the selected manager on company creation', async () => {
    await new CompaniesService(prisma as never).create('admin-id', {
      name: 'Example company',
      managerId,
    });

    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ manager_id: managerId }),
      }),
    );
  });
});
