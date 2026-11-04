import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults when no variables are set', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      LOG_LEVEL: 'info',
      APP_VERSION: 'dev',
    });
  });

  it('accepts valid values', () => {
    expect(
      loadEnv({
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'debug',
        APP_VERSION: 'abc123',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 3000,
      LOG_LEVEL: 'debug',
      APP_VERSION: 'abc123',
    });
  });

  it('throws on an invalid PORT', () => {
    expect(() => loadEnv({ PORT: 'nope' })).toThrow(
      /Invalid environment: PORT:/,
    );
  });

  it('throws on an invalid NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(
      /Invalid environment: NODE_ENV:/,
    );
  });
});
