import type { ExerciseType } from '../../db/schema/exercises';

export const SET_FIELDS = [
  'weightKg',
  'reps',
  'durationS',
  'distanceM',
] as const;
export type SetField = (typeof SET_FIELDS)[number];

export const FIELD_REQUIREMENTS = ['required', 'optional', 'any_of'] as const;
export type FieldRequirement = (typeof FIELD_REQUIREMENTS)[number];

export type FieldRule = {
  id: SetField;
  requirement: FieldRequirement;
  min: number;
  max: number;
};

export const MAX_WEIGHT_KG = 1000;
export const MAX_REPS = 1000;
export const MAX_DURATION_S = 24 * 60 * 60;
export const MAX_DISTANCE_M = 1_000_000;

const weight = (requirement: FieldRequirement, min = 0): FieldRule => ({
  id: 'weightKg',
  requirement,
  min,
  max: MAX_WEIGHT_KG,
});
const reps: FieldRule = {
  id: 'reps',
  requirement: 'required',
  min: 0,
  max: MAX_REPS,
};
const duration = (requirement: FieldRequirement): FieldRule => ({
  id: 'durationS',
  requirement,
  min: 1,
  max: MAX_DURATION_S,
});
const distance = (requirement: FieldRequirement): FieldRule => ({
  id: 'distanceM',
  requirement,
  min: 0.01,
  max: MAX_DISTANCE_M,
});

export const SET_RULES: Readonly<Record<ExerciseType, readonly FieldRule[]>> = {
  weight_reps: [weight('required'), reps],
  bodyweight_reps: [weight('optional', -MAX_WEIGHT_KG), reps],
  duration: [duration('required')],
  distance_duration: [distance('any_of'), duration('any_of')],
  weight_distance: [
    weight('required'),
    distance('required'),
    duration('optional'),
  ],
};

export type SetValues = Readonly<Record<SetField, number | null>>;

export type SetViolation = { field: SetField; message: string };

export function violationsOf(
  type: ExerciseType,
  values: SetValues,
): SetViolation[] {
  const rules = SET_RULES[type];
  const allowed = new Set<SetField>(rules.map((rule) => rule.id));
  const violations: SetViolation[] = [];
  for (const field of SET_FIELDS) {
    if (!allowed.has(field) && values[field] !== null) {
      violations.push({ field, message: 'is not used by this exercise type' });
    }
  }
  let anyOfPresent = false;
  let anyOfExists = false;
  for (const rule of rules) {
    const value = values[rule.id];
    if (rule.requirement === 'any_of') {
      anyOfExists = true;
      anyOfPresent ||= value !== null;
    }
    if (value === null) {
      if (rule.requirement === 'required') {
        violations.push({ field: rule.id, message: 'is required' });
      }
      continue;
    }
    if (value < rule.min || value > rule.max) {
      violations.push({
        field: rule.id,
        message: `must be between ${rule.min} and ${rule.max}`,
      });
    }
  }
  if (anyOfExists && !anyOfPresent) {
    for (const rule of rules) {
      if (rule.requirement === 'any_of') {
        violations.push({
          field: rule.id,
          message: 'at least one of the fields is required',
        });
      }
    }
  }
  return violations;
}
