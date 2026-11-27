import type { DailyTarget } from '../targets/target.response';

export type Totals = {
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
};

export type Eaten = {
  caloriesKcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
};

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sumTotals(rows: readonly Eaten[]): Totals {
  let caloriesKcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  for (const row of rows) {
    caloriesKcal += row.caloriesKcal;
    proteinG += row.proteinG ?? 0;
    fatG += row.fatG ?? 0;
    carbsG += row.carbsG ?? 0;
  }
  return {
    caloriesKcal,
    proteinG: tenth(proteinG),
    fatG: tenth(fatG),
    carbsG: tenth(carbsG),
  };
}

export function remainingOf(target: DailyTarget, totals: Totals): Totals {
  return {
    caloriesKcal: target.caloriesKcal - totals.caloriesKcal,
    proteinG: tenth(target.proteinG - totals.proteinG),
    fatG: tenth(target.fatG - totals.fatG),
    carbsG: tenth(target.carbsG - totals.carbsG),
  };
}
