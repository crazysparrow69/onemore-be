import { describe, expect, it } from 'vitest';
import { PG_UNIQUE_VIOLATION, pgErrorOf } from './pg-error';

describe('pgErrorOf', () => {
  it('reads the code and constraint of a driver error', () => {
    expect(
      pgErrorOf({ code: PG_UNIQUE_VIOLATION, constraint: 'users_email_key' }),
    ).toEqual({ code: '23505', constraint: 'users_email_key' });
  });

  it('walks the cause chain', () => {
    const wrapped = new Error('Failed query', { cause: { code: '23503' } });

    expect(pgErrorOf(wrapped)).toEqual({
      code: '23503',
      constraint: undefined,
    });
  });

  it('ignores codes that are not SQLSTATE', () => {
    expect(pgErrorOf({ code: 'ECONNRESET' })).toBeUndefined();
    expect(pgErrorOf(new Error('x'))).toBeUndefined();
    expect(pgErrorOf(null)).toBeUndefined();
  });
});
