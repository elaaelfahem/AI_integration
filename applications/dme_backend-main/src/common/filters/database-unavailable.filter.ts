import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const transientDatabaseMessages = [
  'timeout exceeded when trying to connect',
  'connection terminated unexpectedly',
  'connection reset by peer',
  'connection refused',
  'econnreset',
  'etimedout',
  'econnrefused',
];

@Catch(Error)
export class DatabaseUnavailableFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseUnavailableFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      const response = host.switchToHttp().getResponse<Response>();
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    if (!isTransientDatabaseError(exception)) {
      throw exception;
    }

    this.logger.error('Database connection failed temporarily');
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'The database is temporarily unavailable. Please try again.',
    });
  }
}

function isTransientDatabaseError(error: Error) {
  const message = error.message.toLowerCase();
  const code = (error as Error & { code?: string }).code?.toUpperCase();
  return (
    code === 'ETIMEDOUT' ||
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P2024' ||
    transientDatabaseMessages.some((part) => message.includes(part))
  );
}
