import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { appError } from './errors';

describe('appError', () => {
  it('uses the catalog status and message', () => {
    const error = appError('NICKNAME_TAKEN');

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'NICKNAME_TAKEN',
      message: 'Nickname is already used',
    });
  });

  it('lets the caller override the message and add details', () => {
    const error = appError('SET_VALUES_INVALID', {
      message: 'Custom',
      details: [{ path: 'a' }],
    });

    expect(error.getResponse()).toEqual({
      statusCode: 400,
      code: 'SET_VALUES_INVALID',
      message: 'Custom',
      details: [{ path: 'a' }],
    });
  });
});
