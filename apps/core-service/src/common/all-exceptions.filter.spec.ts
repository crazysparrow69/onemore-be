import { Logger, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function capture(): {
  host: ArgumentsHost;
  status: () => number;
  body: () => unknown;
} {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
    },
  };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost,
    status: () => statusCode,
    body: () => payload,
  };
}

describe('AllExceptionsFilter', () => {
  it('logs the postgres code and stack without returning them', () => {
    const error = new Error('Failed query: select from core.users');
    error.stack = 'Error: Failed query\n    at query';
    error.cause = {
      code: '42P01',
      message: 'relation "core.users" does not exist',
    };
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const response = capture();

    filter.catch(error, response.host);

    expect(response.status()).toBe(500);
    expect(response.body()).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(logged).toHaveBeenCalledWith(
      'Failed query: select from core.users (pg 42P01)',
      error.stack,
    );
    logged.mockRestore();
  });
});
