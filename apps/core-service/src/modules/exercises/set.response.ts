import { z } from 'zod';
import { SET_KINDS } from '../../db/schema/workouts';

export const setValuesResponse = {
  kind: z.enum(SET_KINDS),
  weightKg: z.number().nullable(),
  reps: z.number().int().nullable(),
  durationS: z.number().int().nullable(),
  distanceM: z.number().nullable(),
};
