import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import { SET_KINDS } from '../../db/schema/workouts';

const instant = z.string().meta({ format: 'date-time' });

const summary = z
  .object({
    durationS: z.number().int(),
    volumeKg: z.number(),
    setCount: z.number().int(),
    exerciseCount: z.number().int(),
  })
  .meta({ id: 'WorkoutTotals' });

const workoutSet = z
  .object({
    kind: z.enum(SET_KINDS),
    weightKg: z.number().nullable(),
    reps: z.number().int().nullable(),
    durationS: z.number().int().nullable(),
    distanceM: z.number().nullable(),
    completedAt: instant.nullable(),
  })
  .meta({ id: 'WorkoutSet' });

const workoutExercise = z
  .object({
    id: z.uuid(),
    exerciseId: z.uuid(),
    name: z.string(),
    image: z.string().nullable(),
    type: z.enum(EXERCISE_TYPES),
    custom: z.boolean(),
    notes: z.string().nullable(),
    restSeconds: z.number().int().nullable(),
    sets: z.array(workoutSet),
  })
  .meta({ id: 'WorkoutExercise' });

const base = {
  id: z.uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  startedAt: instant,
  endedAt: instant,
  localDate: z.string().meta({ format: 'date' }),
  timeZone: z.string(),
  summary,
};

export const workoutDetailsSchema = z
  .object({ ...base, exercises: z.array(workoutExercise) })
  .meta({ id: 'WorkoutDetails' });

export const workoutListItemSchema = z
  .object({
    ...base,
    exercises: z.array(
      z.object({
        exerciseId: z.uuid(),
        name: z.string(),
        image: z.string().nullable(),
        setCount: z.number().int(),
      }),
    ),
  })
  .meta({ id: 'WorkoutSummary' });

export const workoutListResponseSchema = z
  .object({
    items: z.array(workoutListItemSchema),
    total: z.number().int(),
    nextOffset: z.number().int().nullable(),
  })
  .meta({ id: 'WorkoutListResponse' });

const previousSet = z
  .object({
    kind: z.enum(SET_KINDS),
    weightKg: z.number().nullable(),
    reps: z.number().int().nullable(),
    durationS: z.number().int().nullable(),
    distanceM: z.number().nullable(),
  })
  .meta({ id: 'PreviousSet' });

export const previousSetsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          exerciseId: z.uuid(),
          workoutId: z.uuid(),
          startedAt: instant,
          localDate: z.string().meta({ format: 'date' }),
          restSeconds: z.number().int().nullable(),
          sets: z.array(previousSet),
        })
        .meta({ id: 'PreviousExercise' }),
    ),
  })
  .meta({ id: 'PreviousSetsResponse' });

export class PreviousSetsResponseDto extends createZodDto(
  previousSetsResponseSchema,
) {}

export class WorkoutDetailsDto extends createZodDto(workoutDetailsSchema) {}
export class WorkoutListResponseDto extends createZodDto(
  workoutListResponseSchema,
) {}

export type WorkoutDetails = z.infer<typeof workoutDetailsSchema>;
export type WorkoutListItem = z.infer<typeof workoutListItemSchema>;
export type WorkoutListResponse = z.infer<typeof workoutListResponseSchema>;
export type PreviousSetsResponse = z.infer<typeof previousSetsResponseSchema>;
export type WorkoutTotals = z.infer<typeof summary>;
