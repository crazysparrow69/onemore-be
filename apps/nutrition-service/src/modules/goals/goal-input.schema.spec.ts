import { describe, expect, it } from 'vitest';
import { goalInputSchema } from './goal-input.schema';

const today = '2026-11-27';

describe('goalInputSchema', () => {
  it('requires a rate for lose and gain', () => {
    expect(goalInputSchema.safeParse({ type: 'lose', today }).success).toBe(
      false,
    );
    expect(goalInputSchema.safeParse({ type: 'gain', today }).success).toBe(
      false,
    );
    expect(
      goalInputSchema.safeParse({ type: 'lose', rateKgPerWeek: 0.5, today })
        .success,
    ).toBe(true);
  });

  it('allows maintain and recomp without a rate', () => {
    const maintain = goalInputSchema.parse({ type: 'maintain', today });

    expect(maintain.rateKgPerWeek).toBeNull();
    expect(maintain.targetWeightKg).toBeNull();
    expect(goalInputSchema.safeParse({ type: 'recomp', today }).success).toBe(
      true,
    );
  });

  it('keeps the rate between 0.1 and 1 kg per week', () => {
    for (const rateKgPerWeek of [0.05, 1.5, 0]) {
      expect(
        goalInputSchema.safeParse({ type: 'lose', rateKgPerWeek, today })
          .success,
      ).toBe(false);
    }
  });

  it('rounds the rate to hundredths and rejects an absurd target weight', () => {
    expect(
      goalInputSchema.parse({ type: 'gain', rateKgPerWeek: 0.254, today })
        .rateKgPerWeek,
    ).toBe(0.25);
    expect(
      goalInputSchema.safeParse({
        type: 'maintain',
        targetWeightKg: 10,
        today,
      }).success,
    ).toBe(false);
  });
});
