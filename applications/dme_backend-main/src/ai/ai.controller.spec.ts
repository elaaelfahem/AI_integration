import { AiController } from './ai.controller';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
describe('Company and report AI authorization', () => {
  const req = {
    user: {
      sub: 'agent',
      role: 'AGENT' as const,
      type: 'access' as const,
      sessionId: 'session',
    },
  };
  it('does not send another agent company data to AI', async () => {
    const ai = { call: jest.fn() };
    const prisma = {
      company: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      new AiController(ai as never, prisma as never).assistant(req, 'company', {
        question: 'hello',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.call).not.toHaveBeenCalled();
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        assignments: {
          some: { agent_id: 'agent', status: { not: 'CANCELLED' } },
        },
      }),
    });
  });
  it('restricts report cleaning to the assigned agent and draft reports', async () => {
    const ai = { call: jest.fn() };
    const prisma = {
      prospectingMeeting: {
        findFirst: jest.fn().mockResolvedValue({ company_id: 'company' }),
      },
      visitReport: {
        findUnique: jest.fn().mockResolvedValue({ status: 'SUBMITTED' }),
      },
    };
    await expect(
      new AiController(ai as never, prisma as never).cleanReport(
        req,
        'meeting',
        { text: 'report' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.prospectingMeeting.findFirst).toHaveBeenCalledWith({
      where: { id: 'meeting', agent_id: 'agent' },
    });
    expect(ai.call).not.toHaveBeenCalled();
  });
  it('returns a preview without saving the report', async () => {
    const ai = {
      checkInput: jest.fn(),
      modelEnabled: false,
      call: jest.fn().mockResolvedValue({
        company_id: 'company',
        executive_summary: 'Summary',
      }),
    };
    const prisma = {
      prospectingMeeting: {
        findFirst: jest.fn().mockResolvedValue({ company_id: 'company' }),
      },
      visitReport: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    await expect(
      new AiController(ai as never, prisma as never).cleanReport(
        req,
        'meeting',
        { text: 'Original report' },
      ),
    ).resolves.toMatchObject({ executive_summary: 'Summary' });
    expect(prisma.visitReport.update).not.toHaveBeenCalled();
    expect(ai.call).toHaveBeenCalledWith('AI_REPORT_CLEANER_URL', '/v1/clean', {
      company_id: 'company',
      raw_report: 'Original report',
      enable_ai: false,
    });
  });
  it('rejects an assistant reply for a different company', async () => {
    const ai = {
      checkInput: jest.fn(),
      modelEnabled: false,
      call: jest
        .fn()
        .mockResolvedValue({
          company_id: 'wrong',
          answer: 'Unrelated company',
        }),
    };
    const prisma = {
      company: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            name: 'ACME',
            ai_score: 50,
            ai_context: { company_id: 'source-id' },
          }),
      },
    };
    await expect(
      new AiController(ai as never, prisma as never).assistant(req, 'company', {
        question: 'hello',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
