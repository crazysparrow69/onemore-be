import { describe, expect, it } from 'vitest';
import {
  listWeightQuerySchema,
  weightInputSchema,
} from './weight-input.schema';

const today = '2026-11-27';

describe('weightInputSchema', () => {
  it('accepts a weight with or without a note', () => {
    expect(weightInputSchema.parse({ weightKg: 81.4, today }).note).toBeNull();
    expect(
      weightInputSchema.parse({ weightKg: 81.4, note: ' утром ', today }).note,
    ).toBe('утром');
  });

  it('rounds to three decimals so a converted pound value shows back as entered', () => {
    expect(
      weightInputSchema.parse({ weightKg: 81.65293, today }).weightKg,
    ).toBe(81.653);
  });

  it('rejects an absurd weight and a long note', () => {
    expect(weightInputSchema.safeParse({ weightKg: 19, today }).success).toBe(
      false,
    );
    expect(weightInputSchema.safeParse({ weightKg: 401, today }).success).toBe(
      false,
    );
    expect(
      weightInputSchema.safeParse({
        weightKg: 80,
        note: 'x'.repeat(201),
        today,
      }).success,
    ).toBe(false);
  });

  it('requires today', () => {
    expect(weightInputSchema.safeParse({ weightKg: 80 }).success).toBe(false);
  });
});

describe('listWeightQuerySchema', () => {
  it('defaults to 100 entries and caps at 400', () => {
    expect(listWeightQuerySchema.parse({}).limit).toBe(100);
    expect(listWeightQuerySchema.safeParse({ limit: '401' }).success).toBe(
      false,
    );
  });
});
