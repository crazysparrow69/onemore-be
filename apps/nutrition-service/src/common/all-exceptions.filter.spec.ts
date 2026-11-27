import {
  ForbiddenException,
  Logger,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { appError } from './errors';

function capture(): {
  host: ArgumentsHost;
  status: () => number;
  body: () => unknown;
  locals: Record<string, unknown>;
} {
  let statusCode = 0;
  let payload: unknown;
  const locals: Record<string, unknown> = {};
  const response = {
    locals,
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
    locals,
  };
}

describe('AllExceptionsFilter', () => {
  it('passes application errors through and exposes their code', () => {
    const response = capture();

    new AllExceptionsFilter().catch(
      appError('WEIGHT_NOT_FOUND'),
      response.host,
    );

    expect(response.status()).toBe(404);
    expect(response.body()).toMatchObject({ code: 'WEIGHT_NOT_FOUND' });
    expect(response.locals.errorCode).toBe('WEIGHT_NOT_FOUND');
  });

  it('maps built-in http exceptions to stable codes', () => {
    const forbidden = capture();
    const missing = capture();
    const filter = new AllExceptionsFilter();

    filter.catch(new ForbiddenException('No'), forbidden.host);
    filter.catch(new NotFoundException(), missing.host);

    expect(forbidden.body()).toEqual({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'No',
    });
    expect(missing.body()).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('reports validation issues with dotted paths', () => {
    const result = z
      .object({ sets: z.array(z.object({ reps: z.number() })) })
      .safeParse({ sets: [{ reps: 'x' }] });
    const response = capture();
    if (result.success) {
      throw new Error('expected the input to be invalid');
    }

    new AllExceptionsFilter().catch(
      new ZodValidationException(result.error),
      response.host,
    );

    expect(response.status()).toBe(400);
    expect(response.body()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path: 'sets.0.reps' }],
    });
  });

  it('logs the postgres code and stack without returning them', () => {
    const error = new Error(
      'Failed query: select from nutrition.body_profiles',
    );
    error.stack = 'Error: Failed query\n    at query';
    error.cause = {
      code: '42P01',
      message: 'relation "nutrition.body_profiles" does not exist',
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
      'Failed query: select from nutrition.body_profiles (pg 42P01)',
      error.stack,
    );
    logged.mockRestore();
  });
});
