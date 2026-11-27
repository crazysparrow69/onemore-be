import { describe, expect, it } from 'vitest';
import {
  autoTargetInputSchema,
  manualTargetInputSchema,
} from './target-input.schema';

const today = '2026-11-27';

describe('manualTargetInputSchema', () => {
  it('accepts whole calories from 1000 to 6000', () => {
    expect(
      manualTargetInputSchema.safeParse({ caloriesKcal: 2000, today }).success,
    ).toBe(true);
    for (const caloriesKcal of [999, 6001, 2000.5]) {
      expect(
        manualTargetInputSchema.safeParse({ caloriesKcal, today }).success,
      ).toBe(false);
    }
  });

  it('requires calories and today', () => {
    expect(manualTargetInputSchema.safeParse({ today }).success).toBe(false);
    expect(
      manualTargetInputSchema.safeParse({ caloriesKcal: 2000 }).success,
    ).toBe(false);
  });
});

describe('autoTargetInputSchema', () => {
  it('takes only today', () => {
    expect(autoTargetInputSchema.safeParse({ today }).success).toBe(true);
    expect(
      autoTargetInputSchema.safeParse({ today, caloriesKcal: 2000 }).success,
    ).toBe(false);
  });
});
