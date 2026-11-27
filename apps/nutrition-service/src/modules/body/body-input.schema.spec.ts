import { describe, expect, it } from 'vitest';
import { bodyInputSchema } from './body-input.schema';

const valid = {
  sex: 'female',
  birthDate: '1995-05-20',
  heightCm: 168.04,
  activityLevel: 'light',
  today: '2026-11-27',
};

describe('bodyInputSchema', () => {
  it('accepts a valid body and rounds the height to a tenth', () => {
    expect(bodyInputSchema.parse(valid).heightCm).toBe(168);
  });

  it('treats missing own protein and fat as null and rounds protein to a tenth', () => {
    expect(bodyInputSchema.parse(valid)).toMatchObject({
      proteinGPerKg: null,
      fatSharePercent: null,
    });
    expect(
      bodyInputSchema.parse({
        ...valid,
        proteinGPerKg: 1.449,
        fatSharePercent: 30,
      }),
    ).toMatchObject({ proteinGPerKg: 1.4, fatSharePercent: 30 });
  });

  it('keeps own protein within 0.8-3 g/kg and fat within 15-45 percent', () => {
    const rejected = [
      { proteinGPerKg: 0.7 },
      { proteinGPerKg: 3.1 },
      { fatSharePercent: 14 },
      { fatSharePercent: 46 },
      { fatSharePercent: 30.5 },
    ];
    for (const own of rejected) {
      expect(bodyInputSchema.safeParse({ ...valid, ...own }).success).toBe(
        false,
      );
    }
  });

  it('rejects unknown fields and values outside the lists', () => {
    expect(bodyInputSchema.safeParse({ ...valid, extra: 1 }).success).toBe(
      false,
    );
    expect(bodyInputSchema.safeParse({ ...valid, sex: 'other' }).success).toBe(
      false,
    );
    expect(
      bodyInputSchema.safeParse({ ...valid, activityLevel: 'extreme' }).success,
    ).toBe(false);
  });

  it('rejects a height outside 100-250 cm', () => {
    expect(bodyInputSchema.safeParse({ ...valid, heightCm: 99 }).success).toBe(
      false,
    );
    expect(bodyInputSchema.safeParse({ ...valid, heightCm: 251 }).success).toBe(
      false,
    );
  });

  it('requires an age of 13 to 120 years on the given day', () => {
    const young = bodyInputSchema.safeParse({
      ...valid,
      birthDate: '2014-12-01',
    });
    const thirteen = bodyInputSchema.safeParse({
      ...valid,
      birthDate: '2013-11-27',
    });
    const ancient = bodyInputSchema.safeParse({
      ...valid,
      birthDate: '1900-01-01',
    });

    expect(young.success).toBe(false);
    expect(thirteen.success).toBe(true);
    expect(ancient.success).toBe(false);
  });
});
