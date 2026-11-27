import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { logLevelOf, requestProps } from './request-log';

const response = (statusCode: number, locals?: object) =>
  ({ statusCode, locals }) as unknown as ServerResponse;
const request = (user?: object) => ({ user }) as unknown as IncomingMessage;

describe('logLevelOf', () => {
  it.each([
    [200, 'info'],
    [404, 'warn'],
    [409, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('maps status %i to %s', (status, level) => {
    expect(logLevelOf(request(), response(status))).toBe(level);
  });

  it('treats a thrown error as an error', () => {
    expect(logLevelOf(request(), response(200), new Error('boom'))).toBe(
      'error',
    );
  });
});

describe('requestProps', () => {
  it('adds the user and the application error code', () => {
    expect(
      requestProps(request({ id: 'u1' }), response(409, { errorCode: 'X' })),
    ).toEqual({ userId: 'u1', errorCode: 'X' });
  });

  it('adds nothing for anonymous successful requests', () => {
    expect(requestProps(request(), response(200))).toEqual({});
  });
});
