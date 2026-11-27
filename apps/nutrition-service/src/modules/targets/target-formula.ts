import type { ActivityLevel, GoalType, Sex } from '../../db/schema';

export const FORMULA_VERSION = 2;

export const MIN_CALORIES = 800;
export const MAX_CALORIES = 8000;

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const KCAL_PER_KG = 7700;
const DAYS_PER_WEEK = 7;
const RECOMP_DEFICIT_SHARE = 0.1;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_CARBS = 4;
const MAX_PROTEIN_SHARE = 0.4;
const FALLBACK_PROTEIN_SHARE = 0.25;

const PERCENT = 100;

export const PROTEIN_G_PER_KG_RANGE = { min: 0.8, max: 3 } as const;
export const FAT_SHARE_PERCENT_RANGE = { min: 15, max: 45 } as const;
export const DEFAULT_FAT_SHARE_PERCENT = 25;

const BASE_PROTEIN_G_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 1,
  light: 1.2,
  moderate: 1.4,
  active: 1.6,
  very_active: 1.8,
};

const GOAL_PROTEIN_BONUS_G_PER_KG: Record<GoalType, number> = {
  lose: 0.3,
  recomp: 0.3,
  maintain: 0,
  gain: 0,
};

const FALLBACK_ACTIVITY: ActivityLevel = 'moderate';

const SAFE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

export type TargetInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  rateKgPerWeek: number | null;
  proteinGPerKg: number | null;
  fatSharePercent: number | null;
};

export type Macros = { proteinG: number; fatG: number; carbsG: number };

export type CalculatedTarget = Macros & {
  caloriesKcal: number;
  proteinGPerKg: number;
  fatSharePercent: number;
  bmrKcal: number;
  tdeeKcal: number;
  floorApplied: boolean;
};

export function basalMetabolicRate(
  input: Pick<TargetInput, 'sex' | 'weightKg' | 'heightCm' | 'age'>,
): number {
  const sexConstant = input.sex === 'male' ? 5 : -161;
  return (
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant
  );
}

function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

function ceilTo10(value: number): number {
  return Math.ceil(value / 10) * 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dailyChange(rateKgPerWeek: number | null): number {
  return ((rateKgPerWeek ?? 0) * KCAL_PER_KG) / DAYS_PER_WEEK;
}

function adjustedCalories(input: TargetInput, tdee: number): number {
  switch (input.goalType) {
    case 'lose':
      return tdee - dailyChange(input.rateKgPerWeek);
    case 'gain':
      return tdee + dailyChange(input.rateKgPerWeek);
    case 'recomp':
      return tdee * (1 - RECOMP_DEFICIT_SHARE);
    case 'maintain':
      return tdee;
  }
}

export function defaultProteinPerKg(
  activityLevel: ActivityLevel | null,
  goalType: GoalType | null,
): number {
  const base = BASE_PROTEIN_G_PER_KG[activityLevel ?? FALLBACK_ACTIVITY];
  const bonus = GOAL_PROTEIN_BONUS_G_PER_KG[goalType ?? 'maintain'];
  return Math.round((base + bonus) * 10) / 10;
}

export type MacroPreferences = {
  proteinGPerKg: number | null;
  fatSharePercent: number | null;
};

export function macrosFor(
  input: {
    caloriesKcal: number;
    weightKg: number | null;
    goalType: GoalType | null;
    activityLevel: ActivityLevel | null;
  } & MacroPreferences,
): Macros {
  const { caloriesKcal, weightKg, goalType, activityLevel } = input;
  const fatShare =
    (input.fatSharePercent ?? DEFAULT_FAT_SHARE_PERCENT) / PERCENT;
  const perKg =
    input.proteinGPerKg ?? defaultProteinPerKg(activityLevel, goalType);
  const wanted =
    weightKg === null
      ? (caloriesKcal * FALLBACK_PROTEIN_SHARE) / KCAL_PER_G_PROTEIN
      : perKg * weightKg;
  const cap = (caloriesKcal * MAX_PROTEIN_SHARE) / KCAL_PER_G_PROTEIN;
  const proteinG = Math.round(Math.min(wanted, cap));
  const fatG = Math.round((caloriesKcal * fatShare) / KCAL_PER_G_FAT);
  const carbsG = Math.max(
    0,
    Math.round(
      (caloriesKcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT) /
        KCAL_PER_G_CARBS,
    ),
  );
  return { proteinG, fatG, carbsG };
}

export function calculateTarget(input: TargetInput): CalculatedTarget {
  const bmr = basalMetabolicRate(input);
  const tdee = bmr * ACTIVITY_FACTORS[input.activityLevel];
  const adjusted = adjustedCalories(input, tdee);

  const isDeficit = input.goalType === 'lose' || input.goalType === 'recomp';
  const floor = Math.max(bmr, SAFE_FLOOR[input.sex]);
  const floorApplied = isDeficit && adjusted < floor;
  const rounded = isDeficit
    ? Math.max(roundTo10(adjusted), ceilTo10(floor))
    : roundTo10(adjusted);
  const caloriesKcal = clamp(rounded, MIN_CALORIES, MAX_CALORIES);

  return {
    caloriesKcal,
    bmrKcal: Math.round(bmr),
    tdeeKcal: Math.round(tdee),
    floorApplied,
    proteinGPerKg:
      input.proteinGPerKg ??
      defaultProteinPerKg(input.activityLevel, input.goalType),
    fatSharePercent: input.fatSharePercent ?? DEFAULT_FAT_SHARE_PERCENT,
    ...macrosFor({
      caloriesKcal,
      weightKg: input.weightKg,
      goalType: input.goalType,
      activityLevel: input.activityLevel,
      proteinGPerKg: input.proteinGPerKg,
      fatSharePercent: input.fatSharePercent,
    }),
  };
}
