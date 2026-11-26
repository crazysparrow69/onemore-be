import { describe, expect, it } from 'vitest';
import { describeError, unwrapCloudinaryError } from './describe-error';

describe('describeError', () => {
  it('reads the message of an Error', () => {
    expect(describeError(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('reads the message and status of a plain Cloudinary error object', () => {
    expect(
      describeError({ message: 'Invalid api_key', http_code: 401 }, 'fallback'),
    ).toBe('Invalid api_key (HTTP 401)');
    expect(describeError({ message: 'Oops' }, 'fallback')).toBe('Oops');
  });

  it('unwraps the admin API shape with a nested error', () => {
    const rejection = {
      request_options: {},
      error: { message: 'Invalid cloud_name x', http_code: 401 },
    };

    expect(describeError(rejection, 'fallback')).toBe(
      'Invalid cloud_name x (HTTP 401)',
    );
    expect(unwrapCloudinaryError(rejection)).toEqual(rejection.error);
    expect(unwrapCloudinaryError('text')).toBe('text');
  });

  it('falls back for anything else', () => {
    expect(describeError(undefined, 'fallback')).toBe('fallback');
    expect(describeError({ message: '' }, 'fallback')).toBe('fallback');
    expect(describeError('text', 'fallback')).toBe('fallback');
  });
});
