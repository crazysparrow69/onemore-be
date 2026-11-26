import { describe, expect, it } from 'vitest';
import { ENV_KEYS, validateEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  PORT: '5001',
  LOG_LEVEL: 'debug',
  APP_VERSION: 'abc123',
  DATABASE_URL: 'postgresql://core_svc:secret@localhost:5432/onemore',
  NEON_AUTH_URL: 'https://auth.example.test/neondb/auth',
  CLOUDINARY_CLOUD_NAME: 'demo-cloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'secret-value',
  CLOUDINARY_FOLDER: 'onemore-test',
};

describe('validateEnv', () => {
  it('accepts valid values and converts PORT to a number', () => {
    expect(validateEnv(valid)).toEqual({
      NODE_ENV: 'production',
      PORT: 5001,
      LOG_LEVEL: 'debug',
      APP_VERSION: 'abc123',
      DATABASE_URL: 'postgresql://core_svc:secret@localhost:5432/onemore',
      NEON_AUTH_URL: 'https://auth.example.test/neondb/auth',
      CLOUDINARY_CLOUD_NAME: 'demo-cloud',
      CLOUDINARY_API_KEY: '123456789012345',
      CLOUDINARY_API_SECRET: 'secret-value',
      CLOUDINARY_FOLDER: 'onemore-test',
    });
  });

  it('has no defaults: an empty environment reports every variable', () => {
    expect(() => validateEnv({})).toThrow(/^Invalid environment: /);
    for (const key of ENV_KEYS) {
      expect(() => validateEnv({})).toThrow(new RegExp(`${key}: is required`));
    }
  });

  it.each(ENV_KEYS)('throws when %s is missing', (key) => {
    const withoutKey = Object.fromEntries(
      Object.entries(valid).filter(([name]) => name !== key),
    );
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

  it.each(['', 'not a url', 'http://localhost:5432/onemore'])(
    'throws on an invalid DATABASE_URL (%j)',
    (value) => {
      expect(() => validateEnv({ ...valid, DATABASE_URL: value })).toThrow(
        /DATABASE_URL:/,
      );
    },
  );

  it('does not put the connection string into the error message', () => {
    const secret = 'super-secret-password';
    expect(() =>
      validateEnv({
        ...valid,
        DATABASE_URL: `mysql://core_svc:${secret}@localhost/onemore`,
      }),
    ).toThrow(/DATABASE_URL:/);
    try {
      validateEnv({
        ...valid,
        DATABASE_URL: `mysql://core_svc:${secret}@localhost/onemore`,
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it.each(['', 'not a url', 'http://auth.example.test/neondb/auth'])(
    'throws on an invalid NEON_AUTH_URL (%j)',
    (value) => {
      expect(() => validateEnv({ ...valid, NEON_AUTH_URL: value })).toThrow(
        /NEON_AUTH_URL:/,
      );
    },
  );
  it.each([
    ['CLOUDINARY_CLOUD_NAME', 'bad name'],
    ['CLOUDINARY_API_KEY', 'abc'],
    ['CLOUDINARY_API_SECRET', ''],
    ['CLOUDINARY_FOLDER', 'Bad/Folder'],
  ])('throws on an invalid %s (%j)', (key, value) => {
    expect(() => validateEnv({ ...valid, [key]: value })).toThrow(
      new RegExp(`${key}:`),
    );
  });

  it('does not put the Cloudinary secret into the error message', () => {
    try {
      validateEnv({ ...valid, CLOUDINARY_API_KEY: 'secret-looking-value' });
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-value');
    }
  });
});
