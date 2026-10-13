import { BadRequestException } from '@nestjs/common';
import { DatabaseUnavailableFilter } from './database-unavailable.filter';

describe('DatabaseUnavailableFilter', () => {
  it('returns a sanitized service-unavailable response for pool timeouts', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as never;

    new DatabaseUnavailableFilter().catch(
      new Error('timeout exceeded when trying to connect'),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'The database is temporarily unavailable. Please try again.',
    });
  });

  it('does not transform unrelated application errors', () => {
    const filter = new DatabaseUnavailableFilter();
    const host = {} as never;
    const error = new Error('Unexpected application failure');

    expect(() => filter.catch(error, host)).toThrow(error);
  });

  it('preserves structured Nest validation responses', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as never;

    new DatabaseUnavailableFilter().catch(
      new BadRequestException(['Invalid input']),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['Invalid input'],
      error: 'Bad Request',
    });
  });
});
