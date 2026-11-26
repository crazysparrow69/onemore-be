import { z } from 'zod';
import { SET_KINDS } from '../../db/schema/workouts';
import {
  MAX_DISTANCE_M,
  MAX_DURATION_S,
  MAX_REPS,
  MAX_WEIGHT_KG,
} from './set-rules';

export const MAX_EXERCISES_PER_PLAN = 50;
export const MAX_SETS_PER_EXERCISE = 50;
export const MIN_REST_SECONDS = 5;
export const MAX_REST_SECONDS = 600;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export const restSeconds = z
  .number()
  .int()
  .min(MIN_REST_SECONDS)
  .max(MAX_REST_SECONDS)
  .nullable()
  .default(null);

export const setValueShape = {
  kind: z.enum(SET_KINDS).default('working'),
  weightKg: z
    .number()
    .min(-MAX_WEIGHT_KG)
    .max(MAX_WEIGHT_KG)
    .transform((value) => round(value, 3))
    .nullable()
    .default(null),
  reps: z.number().int().min(0).max(MAX_REPS).nullable().default(null),
  durationS: z
    .number()
    .int()
    .min(0)
    .max(MAX_DURATION_S)
    .nullable()
    .default(null),
  distanceM: z
    .number()
    .min(0)
    .max(MAX_DISTANCE_M)
    .transform((value) => round(value, 2))
    .nullable()
    .default(null),
};
