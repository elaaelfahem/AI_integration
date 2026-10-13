import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

const mailStub = new Proxy({}, { get: () => jest.fn() }) as never;

function setup() {
  const prisma = {
    ticket: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 't1' }),
    },
    prospectingMeeting: { findUnique: jest.fn() },
    company: { findFirst: jest.fn() },
  };
  return { prisma, service: new TicketsService(prisma as never, mailStub) };
}

const base = {
  type: 'COMPANY' as const,
  subject: 'Adresse erronée',
  description: 'Le client a déménagé.',
};

describe('TicketsService', () => {
  it('filters by search, dates and company', async () => {
    const { service, prisma } = setup();

    await service.list('agent', 'AGENT', {
      q: '#TCK-0012',
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
      relatedCompanyId: 'c1',
    });

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          created_by_id: 'agent',
          related_company_id: 'c1',
          created_at: {
            gte: new Date('2026-10-01T00:00:00Z'),
            lt: new Date('2026-11-01T00:00:00Z'),
          },
          OR: [
            { subject: { contains: '#TCK-0012', mode: 'insensitive' } },
            { description: { contains: '#TCK-0012', mode: 'insensitive' } },
            { number: 12 },
          ],
        },
      }),
    );
  });

  it('links a visit and takes its company', async () => {
    const { service, prisma } = setup();
    prisma.prospectingMeeting.findUnique.mockResolvedValue({
      id: 'm1',
      company_id: 'c1',
      agent_id: 'agent',
      manager_id: 'boss',
    });

    await service.create(
      'agent',
      { ...base, relatedMeetingId: 'm1' },
      undefined,
      'AGENT',
    );

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          related_company_id: 'c1',
          related_meeting_id: 'm1',
        }),
      }),
    );
  });

  it('refuses a visit the user is not part of', async () => {
    const { service, prisma } = setup();
    prisma.prospectingMeeting.findUnique.mockResolvedValue({
      id: 'm1',
      company_id: 'c1',
      agent_id: 'someone-else',
      manager_id: 'other-boss',
    });

    await expect(
      service.create(
        'agent',
        { ...base, relatedMeetingId: 'm1' },
        undefined,
        'AGENT',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('only lets a manager link their own companies', async () => {
    const { service, prisma } = setup();
    prisma.company.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        'boss',
        { ...base, relatedCompanyId: 'c9' },
        undefined,
        'MANAGER',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c9', manager_id: 'boss' } }),
    );
  });
});
