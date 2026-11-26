import { describe, expect, it } from 'vitest';
import { patchCurrentUserSchema } from './patch-current-user.schema';

describe('patchCurrentUserSchema', () => {
  it('rejects an empty body', () => {
    expect(patchCurrentUserSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field', () => {
    expect(patchCurrentUserSchema.safeParse({ units: 'lb' }).success).toBe(
      true,
    );
    expect(patchCurrentUserSchema.safeParse({ language: 'uk' }).success).toBe(
      true,
    );
  });

  it('keeps absent fields absent', () => {
    expect(patchCurrentUserSchema.parse({ units: 'lb' })).toEqual({
      units: 'lb',
    });
  });

  it('lower-cases and trims the nickname', () => {
    expect(patchCurrentUserSchema.parse({ nickname: '  Serhii_7 ' })).toEqual({
      nickname: 'serhii_7',
    });
  });

  it.each(['ab', 'a'.repeat(21), 'with space', 'dash-ed', 'юзер'])(
    'rejects the nickname %j',
    (nickname) => {
      expect(patchCurrentUserSchema.safeParse({ nickname }).success).toBe(
        false,
      );
    },
  );

  it('clears the nickname and the name with null or an empty string', () => {
    expect(patchCurrentUserSchema.parse({ nickname: null })).toEqual({
      nickname: null,
    });
    expect(patchCurrentUserSchema.parse({ nickname: '  ' })).toEqual({
      nickname: null,
    });
    expect(patchCurrentUserSchema.parse({ name: null })).toEqual({
      name: null,
    });
    expect(patchCurrentUserSchema.parse({ name: '' })).toEqual({ name: null });
  });

  it('trims the name and limits it to 100 characters', () => {
    expect(patchCurrentUserSchema.parse({ name: '  Ada Lovelace ' })).toEqual({
      name: 'Ada Lovelace',
    });
    expect(
      patchCurrentUserSchema.safeParse({ name: 'a'.repeat(101) }).success,
    ).toBe(false);
  });

  it('validates language, units and time zone', () => {
    expect(patchCurrentUserSchema.safeParse({ language: 'ru' }).success).toBe(
      false,
    );
    expect(patchCurrentUserSchema.safeParse({ units: 'stone' }).success).toBe(
      false,
    );
    expect(
      patchCurrentUserSchema.safeParse({ timeZone: 'Not/AZone' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields, including the email and the role', () => {
    expect(
      patchCurrentUserSchema.safeParse({ nickname: 'ada', email: 'a@b.c' })
        .success,
    ).toBe(false);
    expect(patchCurrentUserSchema.safeParse({ role: 'admin' }).success).toBe(
      false,
    );
  });
  it('accepts an avatar id alone, and null to remove the avatar', () => {
    const avatarId = '0198f1c2-7d3a-7b5e-9c1d-2a4b6c8d0e1f';
    expect(patchCurrentUserSchema.parse({ avatarId })).toEqual({ avatarId });
    expect(patchCurrentUserSchema.parse({ avatarId: null })).toEqual({
      avatarId: null,
    });
  });

  it('rejects an avatar id that is not a uuid', () => {
    expect(patchCurrentUserSchema.safeParse({ avatarId: 'abc' }).success).toBe(
      false,
    );
  });
});
