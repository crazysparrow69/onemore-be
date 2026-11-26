import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import {
  dateResponse,
  instantResponse,
  pageResponse,
} from '../../common/response';
import { setValuesResponse } from '../exercises/set.response';

const summary = z
  .object({
    durationS: z.number().int(),
    volumeKg: z.number(),
    setCount: z.number().int(),
    exerciseCount: z.number().int(),
  })
  .meta({ id: 'WorkoutTotals' });

const workoutSet = z
  .object({ ...setValuesResponse, completedAt: instantResponse.nullable() })
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
  templateId: z.uuid().nullable(),
  name: z.string(),
  notes: z.string().nullable(),
  startedAt: instantResponse,
  endedAt: instantResponse,
  localDate: dateResponse,
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

export const workoutListResponseSchema = pageResponse(
  workoutListItemSchema,
  'WorkoutListResponse',
);

const previousSet = z.object(setValuesResponse).meta({ id: 'PreviousSet' });

export const previousSetsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          exerciseId: z.uuid(),
          workoutId: z.uuid(),
          startedAt: instantResponse,
          localDate: dateResponse,
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
