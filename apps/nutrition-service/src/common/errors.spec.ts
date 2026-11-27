import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { appError } from './errors';

describe('appError', () => {
  it('uses the catalog status and message', () => {
    const error = appError('TARGET_INPUTS_MISSING');

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'TARGET_INPUTS_MISSING',
      message: 'Fill in the body profile, the goal and the weight first',
    });
  });

  it('lets the caller override the message and add details', () => {
    const error = appError('DATE_OUT_OF_RANGE', {
      message: 'Custom',
      details: [{ path: 'a' }],
    });

    expect(error.getResponse()).toEqual({
      statusCode: 400,
      code: 'DATE_OUT_OF_RANGE',
      message: 'Custom',
      details: [{ path: 'a' }],
    });
  });
});
