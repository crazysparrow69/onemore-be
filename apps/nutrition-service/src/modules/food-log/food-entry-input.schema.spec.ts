import { describe, expect, it } from 'vitest';
import {
  daysQuerySchema,
  foodEntryInputSchema,
} from './food-entry-input.schema';

const valid = {
  localDate: '2026-11-27',
  meal: 'breakfast',
  name: 'Овсянка',
  caloriesKcal: 350,
};

describe('foodEntryInputSchema', () => {
  it('needs only the date, the meal, the name and the calories', () => {
    expect(foodEntryInputSchema.parse(valid)).toEqual({
      ...valid,
      amount: null,
      unit: null,
      proteinG: null,
      fatG: null,
      carbsG: null,
      source: 'manual',
    });
  });

  it('allows any subset of the macros, for example only protein', () => {
    const parsed = foodEntryInputSchema.parse({ ...valid, proteinG: 12.04 });

    expect(parsed.proteinG).toBe(12);
    expect(parsed.fatG).toBeNull();
    expect(parsed.carbsG).toBeNull();
  });

  it('takes amount and unit together or not at all', () => {
    expect(
      foodEntryInputSchema.safeParse({ ...valid, amount: 150, unit: 'g' })
        .success,
    ).toBe(true);
    expect(
      foodEntryInputSchema.safeParse({ ...valid, amount: 150 }).success,
    ).toBe(false);
    expect(
      foodEntryInputSchema.safeParse({ ...valid, unit: 'g' }).success,
    ).toBe(false);
  });

  it('rejects an empty name, an unknown meal and negative values', () => {
    expect(
      foodEntryInputSchema.safeParse({ ...valid, name: ' ' }).success,
    ).toBe(false);
    expect(
      foodEntryInputSchema.safeParse({ ...valid, meal: 'brunch' }).success,
    ).toBe(false);
    expect(
      foodEntryInputSchema.safeParse({ ...valid, caloriesKcal: -1 }).success,
    ).toBe(false);
    expect(
      foodEntryInputSchema.safeParse({ ...valid, fatG: -0.1 }).success,
    ).toBe(false);
  });

  it('requires whole calories', () => {
    expect(
      foodEntryInputSchema.safeParse({ ...valid, caloriesKcal: 350.5 }).success,
    ).toBe(false);
  });
});

describe('daysQuerySchema', () => {
  it('accepts a range of up to 62 days', () => {
    expect(
      daysQuerySchema.safeParse({ from: '2026-11-01', to: '2027-01-01' })
        .success,
    ).toBe(true);
    expect(
      daysQuerySchema.safeParse({ from: '2026-11-01', to: '2027-01-02' })
        .success,
    ).toBe(false);
  });

  it('rejects a reversed range', () => {
    expect(
      daysQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' })
        .success,
    ).toBe(false);
  });
});
