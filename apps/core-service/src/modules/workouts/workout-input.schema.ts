import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SET_KINDS } from '../../db/schema/workouts';
import { timeZone } from '../users/update-current-user.schema';
import {
  MAX_DISTANCE_M,
  MAX_DURATION_S,
  MAX_REPS,
  MAX_WEIGHT_KG,
} from '../exercises/set-rules';

export const MAX_WORKOUT_EXERCISES = 50;
export const MAX_SETS_PER_EXERCISE = 50;
export const MAX_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 1000;
export const MIN_REST_SECONDS = 5;
export const MAX_REST_SECONDS = 600;

const CONTROL_CHARACTER = /(?![\t\n\r\f\v])\p{Cc}/u;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const name = z
  .string()
  .trim()
  .max(MAX_NAME_LENGTH)
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    message: 'must not contain control characters',
  })
  .transform((value) => value.replace(/\s+/g, ' '))
  .default('');

export const notes = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH)
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    message: 'must not contain control characters',
  })
  .nullable()
  .default(null)
  .transform((value) => (value === null || value.length === 0 ? null : value));

const instant = z.iso.datetime({ offset: true });

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

const setSchema = z
  .strictObject({
    ...setValueShape,
    completedAt: instant.nullable().default(null),
  })
  .meta({ id: 'WorkoutSetInput' });

const exerciseSchema = z
  .strictObject({
    exerciseId: z.uuid(),
    notes,
    restSeconds: z
      .number()
      .int()
      .min(MIN_REST_SECONDS)
      .max(MAX_REST_SECONDS)
      .nullable()
      .default(null),
    sets: z.array(setSchema).max(MAX_SETS_PER_EXERCISE),
  })
  .meta({ id: 'WorkoutExerciseInput' });

export const workoutInputSchema = z
  .strictObject({
    name,
    notes,
    templateId: z.uuid().nullable().default(null),
    startedAt: instant,
    endedAt: instant,
    timeZone,
    exercises: z.array(exerciseSchema).max(MAX_WORKOUT_EXERCISES),
  })
  .meta({ id: 'WorkoutInput' });

export class WorkoutInputDto extends createZodDto(workoutInputSchema) {}

export type WorkoutInput = z.output<typeof workoutInputSchema>;
export type WorkoutSetInput = WorkoutInput['exercises'][number]['sets'][number];

export const workoutIdParamsSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'WorkoutIdParams' });

export class WorkoutIdParamsDto extends createZodDto(workoutIdParamsSchema) {}

export const listWorkoutsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'ListWorkoutsQuery' });

export class ListWorkoutsQueryDto extends createZodDto(
  listWorkoutsQuerySchema,
) {}

export type ListWorkoutsQuery = z.output<typeof listWorkoutsQuerySchema>;

export const previousSetsQuerySchema = z
  .object({
    exerciseIds: z
      .string()
      .transform((value) => [
        ...new Set(value.split(',').filter((item) => item.length > 0)),
      ])
      .pipe(z.array(z.uuid()).min(1).max(MAX_WORKOUT_EXERCISES))
      .meta({
        description:
          'Comma-separated exercise ids, up to 50; exercises without history are omitted from the answer',
      }),
  })
  .meta({ id: 'PreviousSetsQuery' });

export class PreviousSetsQueryDto extends createZodDto(
  previousSetsQuerySchema,
) {}
