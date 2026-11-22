import { describe, expect, it } from 'vitest';
import { updateCurrentUserSchema } from './update-current-user.schema';

const valid = { language: 'en', timeZone: 'Europe/Kyiv' };

describe('updateCurrentUserSchema', () => {
  it('accepts a supported language and an IANA time zone', () => {
    expect(updateCurrentUserSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts Ukrainian', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, language: 'uk' }).success,
    ).toBe(true);
  });

  it('accepts kg and lb, and works without units', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, units: 'kg' }).success,
    ).toBe(true);
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, units: 'lb' }).success,
    ).toBe(true);
    expect(updateCurrentUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects other units', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, units: 'stone' }).success,
    ).toBe(false);
  });

  it('rejects an unsupported language', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, language: 'ru' }).success,
    ).toBe(false);
  });

  it('rejects a time zone Intl does not know', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, timeZone: 'Not/AZone' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      updateCurrentUserSchema.safeParse({ ...valid, nickname: 'ada' }).success,
    ).toBe(false);
  });
});
