import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VisitReportsService } from './visit-reports.service';

function setup() {
  const prisma = {
    prospectingMeeting: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'm1', agent_id: 'agent', manager_id: 'boss' }),
    },
  };
  const ocr = {
    recognize: jest.fn().mockResolvedValue({
      text: 'Client intéressé par SD-WAN',
      confidence: 88,
      engine: 'tesseract',
    }),
  };
  const service = new VisitReportsService(prisma as never, {} as never, ocr);
  return { service, ocr };
}

const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1000 };

describe('VisitReportsService.scanNotes', () => {
  it('returns the text read from the photo', async () => {
    const { service } = setup();

    await expect(
      service.scanNotes('m1', 'agent', 'AGENT', image),
    ).resolves.toEqual({
      text: 'Client intéressé par SD-WAN',
      confidence: 88,
      engine: 'tesseract',
      empty: false,
    });
  });

  it('is only for the agent of the visit', async () => {
    const { service } = setup();

    await expect(
      service.scanNotes('m1', 'boss', 'MANAGER', image),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.scanNotes('m1', 'other-agent', 'AGENT', image),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects non-images and missing files', async () => {
    const { service } = setup();

    await expect(
      service.scanNotes('m1', 'agent', 'AGENT', {
        ...image,
        mimetype: 'application/pdf',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.scanNotes('m1', 'agent', 'AGENT')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('answers 503 when the OCR engine fails', async () => {
    const { service, ocr } = setup();
    ocr.recognize.mockRejectedValue(new Error('engine down'));

    await expect(
      service.scanNotes('m1', 'agent', 'AGENT', image),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
