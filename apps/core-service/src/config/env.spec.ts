import { describe, expect, it } from 'vitest';
import { ENV_KEYS, validateEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  PORT: '3000',
  LOG_LEVEL: 'debug',
  APP_VERSION: 'abc123',
};

describe('validateEnv', () => {
  it('accepts valid values and converts PORT to a number', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'production',
      PORT: 3000,
      LOG_LEVEL: 'debug',
      APP_VERSION: 'abc123',
    });
  });

  it('has no defaults: an empty environment reports every variable', () => {
    expect(() => validateEnv({})).toThrow(/^Invalid environment: /);
    for (const key of ENV_KEYS) {
      expect(() => validateEnv({})).toThrow(new RegExp(`${key}: is required`));
    }
  });

  it.each(ENV_KEYS)('throws when %s is missing', (key) => {
    const withoutKey: Record<string, string> = { ...valid };
    delete withoutKey[key];
    expect(() => validateEnv(withoutKey)).toThrow(
      new RegExp(`Invalid environment: ${key}: is required`),
    );
  });

  it('throws on an invalid PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: 'nope' })).toThrow(
      /PORT: must be an integer between 1 and 65535/,
    );
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT:/);
  });

  it('throws on an invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV:/,
    );
  });

  it('throws on an empty APP_VERSION', () => {
    expect(() => validateEnv({ ...valid, APP_VERSION: '' })).toThrow(
      /APP_VERSION: must not be empty/,
    );
  });
});
