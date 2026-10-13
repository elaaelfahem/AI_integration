import { BadRequestException } from '@nestjs/common';
import { MonthlyReportService } from './monthly-report.service';

const visit = (id: string, status: string, agent = 'a1') => ({
  id,
  agent_id: agent,
  manager_id: 'boss',
  company_id: id,
  company: { id, name: `C${id}`, address: null, governorate: null },
  scheduled_at: new Date('2026-09-10T09:00:00Z'),
  duration_minutes: 60,
  status,
  visit_type: 'FIRST_VISIT',
  priority: 'MEDIUM',
  reminder_enabled: true,
});

function setup() {
  const prisma = {
    prospectingMeeting: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          visit('1', 'COMPLETED'),
          visit('2', 'CANCELLED'),
          visit('3', 'NO_SHOW', 'a2'),
          visit('4', 'SCHEDULED', 'a2'),
        ]),
    },
    assignment: { findMany: jest.fn().mockResolvedValue([]) },
    visitReport: {
      findMany: jest.fn().mockResolvedValue([
        {
          status: 'VALIDATED',
          interest_level: 'HIGH',
          outcome_result: 'OPPORTUNITY_WON',
          submitted_at: new Date(),
          meeting: {
            id: '1',
            title: 'Visite',
            scheduled_at: new Date('2026-09-10T09:00:00Z'),
            agent_id: 'a1',
            company: { name: 'C1' },
          },
        },
      ]),
    },
    fieldReport: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ first_name: 'Rania', last_name: 'B' }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', first_name: 'Sami', last_name: 'A' },
        { id: 'a2', first_name: 'Ines', last_name: 'B' },
      ]),
    },
  };
  return { prisma, service: new MonthlyReportService(prisma as never) };
}

describe('MonthlyReportService', () => {
  it('rolls up a manager’s month', async () => {
    const { service, prisma } = setup();

    const month = await service.summary('boss', 'MANAGER', '2026-09');

    expect(month.label).toBe('septembre 2026');
    expect(month.scope).toBe('Équipe de Rania B');
    expect(month.visits).toEqual({
      total: 4,
      completed: 1,
      cancelled: 1,
      missed: 1,
      open: 1,
    });
    expect(month.visitReports.byStatus.VALIDATED).toBe(1);
    expect(month.visitReports.byOutcome.OPPORTUNITY_WON).toBe(1);
    expect(
      month.agents.map((a) => [a.name, a.visits, a.reportsValidated]),
    ).toEqual([
      ['Ines B', 2, 0],
      ['Sami A', 2, 1],
    ]);
    // Scoped to the manager's team, inside September (Tunis time).
    expect(prisma.visitReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          meeting: {
            manager_id: 'boss',
            scheduled_at: {
              gte: new Date('2026-08-31T23:00:00.000Z'),
              lt: new Date('2026-09-30T23:00:00.000Z'),
            },
          },
        },
      }),
    );
  });

  it('rejects a malformed month', async () => {
    await expect(
      setup().service.summary('s', 'SUPERADMIN', '2026-13'),
    ).rejects.toThrow(BadRequestException);
  });

  it('exports a PDF', async () => {
    const pdf = await setup().service.exportPdf('boss', 'MANAGER', '2026-09');

    expect(pdf.filename).toBe('rapport-mensuel-2026-09.pdf');
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
