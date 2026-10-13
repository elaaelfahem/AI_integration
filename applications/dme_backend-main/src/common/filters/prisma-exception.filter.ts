import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const code = exception.code;
    const unavailable =
      code === 'ETIMEDOUT' ||
      code === 'P1001' ||
      code === 'P1002' ||
      code === 'P2024';

    this.logger.error(`Prisma request failed${code ? ` (${code})` : ''}`);

    response
      .status(
        unavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR,
      )
      .json({
        statusCode: unavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR,
        message: unavailable
          ? 'The database is temporarily unavailable. Please try again.'
          : 'The request could not be completed.',
      });
  }
}
