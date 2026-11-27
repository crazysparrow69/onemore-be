import { describe, expect, it } from 'vitest';
import {
  basalMetabolicRate,
  calculateTarget,
  macrosFor,
  type TargetInput,
} from './target-formula';

const man: TargetInput = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goalType: 'maintain',
  rateKgPerWeek: null,
};

const woman: TargetInput = {
  sex: 'female',
  age: 25,
  heightCm: 165,
  weightKg: 60,
  activityLevel: 'light',
  goalType: 'maintain',
  rateKgPerWeek: null,
};

describe('basalMetabolicRate', () => {
  it('follows Mifflin - St Jeor for a man', () => {
    expect(basalMetabolicRate(man)).toBe(1780);
  });

  it('follows Mifflin - St Jeor for a woman', () => {
    expect(basalMetabolicRate(woman)).toBe(1345.25);
  });
});

describe('calculateTarget', () => {
  it('maintains at TDEE rounded to 10 kcal', () => {
    const target = calculateTarget(man);

    expect(target).toMatchObject({
      caloriesKcal: 2760,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
    });
  });

  it('turns the weekly rate into a daily deficit for losing', () => {
    const target = calculateTarget({
      ...man,
      goalType: 'lose',
      rateKgPerWeek: 0.5,
    });

    expect(target.caloriesKcal).toBe(2210);
    expect(target.floorApplied).toBe(false);
  });

  it('adds the daily surplus for gaining', () => {
    const target = calculateTarget({
      ...man,
      goalType: 'gain',
      rateKgPerWeek: 0.25,
    });

    expect(target.caloriesKcal).toBe(3030);
  });

  it('cuts 10 percent for recomposition', () => {
    const target = calculateTarget({ ...man, goalType: 'recomp' });

    expect(target.caloriesKcal).toBe(2480);
  });

  it('never goes below the safe floor and says so', () => {
    const target = calculateTarget({
      ...woman,
      goalType: 'lose',
      rateKgPerWeek: 1,
    });

    expect(target.floorApplied).toBe(true);
    expect(target.caloriesKcal).toBe(1350);
  });

  it('uses the basal rate as the floor when it is above the fixed minimum', () => {
    const target = calculateTarget({
      ...man,
      weightKg: 140,
      activityLevel: 'sedentary',
      goalType: 'lose',
      rateKgPerWeek: 1,
    });

    expect(target.floorApplied).toBe(true);
    expect(target.caloriesKcal).toBeGreaterThanOrEqual(target.bmrKcal);
  });

  it('applies the floor to deficits only', () => {
    const target = calculateTarget({
      ...woman,
      weightKg: 40,
      heightCm: 150,
      age: 60,
      activityLevel: 'sedentary',
    });

    expect(target.floorApplied).toBe(false);
    expect(target.caloriesKcal).toBeLessThan(1200);
    expect(target.caloriesKcal).toBeGreaterThanOrEqual(800);
  });

  it('keeps calories inside the stored range', () => {
    const tiny = calculateTarget({
      ...woman,
      weightKg: 20,
      heightCm: 100,
      age: 90,
      activityLevel: 'sedentary',
    });
    const huge = calculateTarget({
      ...man,
      weightKg: 400,
      heightCm: 250,
      age: 18,
      activityLevel: 'very_active',
      goalType: 'gain',
      rateKgPerWeek: 1,
    });

    expect(tiny.caloriesKcal).toBe(800);
    expect(huge.caloriesKcal).toBe(8000);
  });

  it('gives more protein per kilogram when losing than when maintaining', () => {
    const lose = calculateTarget({
      ...man,
      goalType: 'lose',
      rateKgPerWeek: 0.5,
    });
    const maintain = calculateTarget(man);

    expect(lose.proteinG).toBe(144);
    expect(maintain.proteinG).toBe(128);
  });

  it('makes calories add up from protein, fat and carbs within rounding', () => {
    const target = calculateTarget(man);
    const sum = target.proteinG * 4 + target.fatG * 9 + target.carbsG * 4;

    expect(Math.abs(sum - target.caloriesKcal)).toBeLessThanOrEqual(10);
  });

  it('does not depend on the sex constant for the activity factor', () => {
    const light = calculateTarget({ ...man, activityLevel: 'light' });
    const active = calculateTarget({ ...man, activityLevel: 'very_active' });

    expect(light.caloriesKcal).toBeLessThan(active.caloriesKcal);
  });
});

describe('macrosFor', () => {
  it('splits fat at 25 percent of calories and gives the rest to carbs', () => {
    expect(
      macrosFor({ caloriesKcal: 2000, weightKg: 75, goalType: 'maintain' }),
    ).toEqual({ proteinG: 120, fatG: 56, carbsG: 254 });
  });

  it('caps protein at 40 percent of calories', () => {
    const macros = macrosFor({
      caloriesKcal: 1000,
      weightKg: 150,
      goalType: 'lose',
    });

    expect(macros.proteinG).toBe(100);
    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('takes a quarter of calories as protein when the weight is unknown', () => {
    expect(
      macrosFor({ caloriesKcal: 2000, weightKg: null, goalType: null })
        .proteinG,
    ).toBe(125);
  });

  it('never returns negative carbs', () => {
    const macros = macrosFor({
      caloriesKcal: 800,
      weightKg: 400,
      goalType: 'lose',
    });

    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });
});
