import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, ProspectionStatus } from '@prisma/client';
import { ReportsService } from './reports.service';

const mailStub = new Proxy({}, { get: () => jest.fn() }) as never;

describe('ReportsService', () => {
  const assignment = {
    id: 'assignment-id',
    company_id: 'company-id',
    manager_id: 'manager-id',
    agent_id: 'agent-id',
    status: AssignmentStatus.ASSIGNED,
    company: { id: 'company-id', name: 'Example Company' },
  } as never;

  function createService() {
    const prisma = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue(assignment),
        update: jest.fn().mockResolvedValue(assignment),
      },
      prospection: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'prospection-id' }),
        update: jest.fn().mockResolvedValue({ id: 'prospection-id' }),
        upsert: jest.fn().mockResolvedValue({
          id: 'prospection-id',
          status: ProspectionStatus.VISITED,
          company: assignment.company,
        }),
      },
      fieldReport: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'report-id' }),
      },
      reportProcessingResult: {
        upsert: jest.fn().mockResolvedValue({ id: 'processing-id' }),
      },
      $transaction: jest.fn().mockImplementation(async (value: unknown) => {
        if (Array.isArray(value))
          return [
            {
              id: 'prospection-id',
              status: ProspectionStatus.VISITED,
            },
            assignment,
          ];
        const transaction = value as (client: unknown) => Promise<unknown>;
        return transaction({
          assignment: {
            update: jest.fn().mockResolvedValue(assignment),
          },
          prospection: {
            create: jest.fn().mockResolvedValue({ id: 'prospection-id' }),
            update: jest.fn().mockResolvedValue({ id: 'prospection-id' }),
          },
          fieldReport: {
            upsert: jest.fn().mockResolvedValue({ id: 'report-id' }),
          },
          reportProcessingResult: {
            upsert: jest.fn().mockResolvedValue({ id: 'processing-id' }),
          },
        });
      }),
    };
    return {
      service: new ReportsService(prisma as never, mailStub),
      prisma,
    };
  }

  it('rejects assignments outside the manager scope', async () => {
    const { service, prisma } = createService();
    await expect(
      service.updateProspection('assignment-id', 'another-manager', 'MANAGER', {
        status: ProspectionStatus.VISITED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.prospection.upsert).not.toHaveBeenCalled();
  });

  it('persists the visit status and synchronizes the assignment', async () => {
    const { service, prisma } = createService();
    const result = await service.updateProspection(
      'assignment-id',
      'manager-id',
      'MANAGER',
      { status: ProspectionStatus.VISITED, notes: 'Visited' },
    );
    expect(result.status).toBe(ProspectionStatus.VISITED);
    expect(prisma.prospection.upsert).toHaveBeenCalled();
    expect(prisma.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assignment-id' },
        data: expect.objectContaining({ status: AssignmentStatus.COMPLETED }),
      }),
    );
  });

  it('keeps the report input separate from the structured processing result', async () => {
    const { service, prisma } = createService();
    prisma.fieldReport.findUnique.mockResolvedValue({
      id: 'report-id',
      prospection: { assignment_id: 'assignment-id' },
      processing: { status: 'COMPLETED', verdict: 'QUALIFIED_FOLLOW_UP' },
    });
    const result = await service.submitReport(
      'assignment-id',
      'agent-id',
      'AGENT',
      {
        summary: 'Visited',
        needs: 'Connectivity',
        outcome: 'Follow-up',
        nextAction: 'Technical workshop',
      },
    );
    expect(result.processing?.verdict).toBe('QUALIFIED_FOLLOW_UP');
    expect(prisma.reportProcessingResult.upsert).not.toHaveBeenCalled();
  });

  it('returns a not-found error when a report has not been submitted', async () => {
    const { service } = createService();
    await expect(
      service.getReportByAssignment('assignment-id', 'manager-id', 'MANAGER'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not reopen a terminal prospection from a later report', async () => {
    const { service, prisma } = createService();
    prisma.prospection.findUnique.mockResolvedValue({
      id: 'prospection-id',
      status: ProspectionStatus.CONVERTED,
    });

    await expect(
      service.submitReport('assignment-id', 'agent-id', 'AGENT', {
        summary: 'Follow-up visit',
        needs: 'None',
        outcome: 'No further action',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
