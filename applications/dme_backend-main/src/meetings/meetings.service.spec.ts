import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MeetingStatus } from '@prisma/client';
import { MeetingsService } from './meetings.service';

const mailStub = new Proxy({}, { get: () => jest.fn() }) as never;

describe('MeetingsService', () => {
  const managerId = '11111111-1111-4111-8111-111111111111';
  const agentId = '22222222-2222-4222-8222-222222222222';
  const companyId = '33333333-3333-4333-8333-333333333333';
  const meetingId = '44444444-4444-4444-8444-444444444444';
  let prisma: {
    account: { findFirst: jest.Mock };
    company: { findFirst: jest.Mock };
    prospectingMeeting: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: MeetingsService;

  const scheduledAt = () => new Date(Date.now() + 3_600_000).toISOString();
  const meeting = (status = MeetingStatus.SCHEDULED) => ({
    id: meetingId,
    company_id: companyId,
    manager_id: managerId,
    agent_id: agentId,
    scheduled_at: new Date(scheduledAt()),
    duration_minutes: 60,
    status,
  });

  beforeEach(() => {
    prisma = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: managerId }) },
      company: { findFirst: jest.fn().mockResolvedValue({ id: companyId }) },
      prospectingMeeting: {
        create: jest.fn().mockResolvedValue({ id: meetingId }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(meeting()),
        update: jest.fn().mockResolvedValue({ id: meetingId }),
      },
    };
    service = new MeetingsService(prisma as never, mailStub);
  });

  it('creates a future meeting for an active manager agent and company', async () => {
    await service.create(managerId, 'MANAGER', {
      companyId,
      agentId,
      title: '  First meeting  ',
      scheduledAt: scheduledAt(),
      durationMinutes: 60,
    });

    expect(prisma.prospectingMeeting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          company_id: companyId,
          manager_id: managerId,
          agent_id: agentId,
          title: 'First meeting',
        }),
      }),
    );
  });

  it('prevents scheduling an overlapping meeting for the agent', async () => {
    prisma.prospectingMeeting.findMany.mockResolvedValue([
      {
        scheduled_at: new Date(Date.now() + 3_600_000),
        duration_minutes: 60,
      },
    ]);

    await expect(
      service.create(managerId, 'MANAGER', {
        companyId,
        agentId,
        title: 'Meeting',
        scheduledAt: scheduledAt(),
        durationMinutes: 30,
      }),
    ).rejects.toThrow('The agent already has a meeting at this time');
  });

  it('blocks agents from reassigning their meetings', async () => {
    await expect(
      service.update(meetingId, agentId, 'AGENT', { agentId: managerId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks managers from transferring meetings to another manager', async () => {
    await expect(
      service.update(meetingId, managerId, 'MANAGER', {
        managerId: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires an outcome when an agent completes a meeting', async () => {
    prisma.prospectingMeeting.findUnique.mockResolvedValue(
      meeting(MeetingStatus.IN_PROGRESS),
    );

    await expect(
      service.update(meetingId, agentId, 'AGENT', {
        status: MeetingStatus.COMPLETED,
      }),
    ).rejects.toThrow('A completed meeting requires an outcome');
  });

  it('requires a reason before a manager cancels a meeting', async () => {
    await expect(
      service.update(meetingId, managerId, 'MANAGER', {
        status: MeetingStatus.CANCELLED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets an agent edit the details of their own scheduled meeting', async () => {
    await expect(
      service.update(meetingId, agentId, 'AGENT', {
        title: 'Updated title',
        location: 'New office',
        scheduledAt: scheduledAt(),
      }),
    ).resolves.toEqual({ id: meetingId });
  });

  it('blocks an agent from editing details once a meeting is completed', async () => {
    prisma.prospectingMeeting.findUnique.mockResolvedValue(
      meeting(MeetingStatus.COMPLETED),
    );

    await expect(
      service.update(meetingId, agentId, 'AGENT', {
        title: 'Updated title',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets an agent edit notes on their own already-completed meeting', async () => {
    prisma.prospectingMeeting.findUnique.mockResolvedValue(
      meeting(MeetingStatus.COMPLETED),
    );

    await expect(
      service.update(meetingId, agentId, 'AGENT', {
        completionNotes: 'Updated notes after the fact',
      }),
    ).resolves.toEqual({ id: meetingId });
  });

  it('blocks an agent from setting notes outside the completion flow', async () => {
    await expect(
      service.update(meetingId, agentId, 'AGENT', {
        completionNotes: 'Too early',
      }),
    ).rejects.toThrow(
      'Agents can add an outcome only while completing a meeting',
    );
  });

  it('rejects a meeting for a company outside the manager scope', async () => {
    prisma.company.findFirst.mockResolvedValue(null);

    await expect(
      service.create(managerId, 'MANAGER', {
        companyId,
        agentId,
        title: 'Meeting',
        scheduledAt: scheduledAt(),
        durationMinutes: 60,
      }),
    ).rejects.toThrow('Company not found');
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: companyId,
        status: 'ACTIVE',
        manager_id: managerId,
      },
      select: { id: true },
    });
  });
});
