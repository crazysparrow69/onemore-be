import { describe, expect, it } from 'vitest';
import { updateMeSchema } from './update-me.schema';

const valid = { language: 'en', timeZone: 'Europe/Kyiv' };

describe('updateMeSchema', () => {
  it('accepts a supported language and an IANA time zone', () => {
    expect(updateMeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an unsupported language', () => {
    expect(updateMeSchema.safeParse({ ...valid, language: 'ru' }).success).toBe(
      false,
    );
  });

  it('rejects a time zone Intl does not know', () => {
    expect(
      updateMeSchema.safeParse({ ...valid, timeZone: 'Not/AZone' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(updateMeSchema.safeParse({ ...valid, units: 'kg' }).success).toBe(
      false,
    );
  });
});
