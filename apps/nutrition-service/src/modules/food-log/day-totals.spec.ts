import { describe, expect, it } from 'vitest';
import { remainingOf, sumTotals } from './day-totals';

describe('sumTotals', () => {
  it('adds calories and macros, counting a missing macro as zero', () => {
    expect(
      sumTotals([
        { caloriesKcal: 350, proteinG: 12, fatG: 7, carbsG: 60 },
        { caloriesKcal: 60, proteinG: null, fatG: null, carbsG: null },
        { caloriesKcal: 200, proteinG: 30.5, fatG: null, carbsG: 0 },
      ]),
    ).toEqual({ caloriesKcal: 610, proteinG: 42.5, fatG: 7, carbsG: 60 });
  });

  it('returns zeros for an empty day', () => {
    expect(sumTotals([])).toEqual({
      caloriesKcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    });
  });

  it('does not leak floating point noise', () => {
    const rows = Array.from({ length: 3 }, () => ({
      caloriesKcal: 1,
      proteinG: 0.1,
      fatG: 0.2,
      carbsG: 0.3,
    }));

    expect(sumTotals(rows)).toMatchObject({
      proteinG: 0.3,
      fatG: 0.6,
      carbsG: 0.9,
    });
  });
});

describe('remainingOf', () => {
  const target = { caloriesKcal: 2200, proteinG: 140, fatG: 61, carbsG: 250 };

  it('subtracts what was eaten', () => {
    expect(
      remainingOf(target, {
        caloriesKcal: 1500,
        proteinG: 90.5,
        fatG: 40,
        carbsG: 180,
      }),
    ).toEqual({ caloriesKcal: 700, proteinG: 49.5, fatG: 21, carbsG: 70 });
  });

  it('goes negative when the day is overeaten', () => {
    expect(
      remainingOf(target, {
        caloriesKcal: 2500,
        proteinG: 150,
        fatG: 61,
        carbsG: 250,
      }),
    ).toMatchObject({ caloriesKcal: -300, proteinG: -10 });
  });
});
