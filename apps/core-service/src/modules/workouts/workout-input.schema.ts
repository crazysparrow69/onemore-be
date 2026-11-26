import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  cleanText,
  commaList,
  createIdParamsDto,
  ianaTimeZone,
  instant,
  MAX_NAME_LENGTH,
  optionalNotes,
  paginationShape,
} from '../../common/validation';
import {
  MAX_EXERCISES_PER_PLAN,
  MAX_SETS_PER_EXERCISE,
  restSeconds,
  setValueShape,
} from '../exercises/set-input';

const name = cleanText({ max: MAX_NAME_LENGTH }).default('');

const setSchema = z
  .strictObject({
    ...setValueShape,
    completedAt: instant.nullable().default(null),
  })
  .meta({ id: 'WorkoutSetInput' });

const exerciseSchema = z
  .strictObject({
    exerciseId: z.uuid(),
    notes: optionalNotes,
    restSeconds,
    sets: z.array(setSchema).max(MAX_SETS_PER_EXERCISE),
  })
  .meta({ id: 'WorkoutExerciseInput' });

export const workoutInputSchema = z
  .strictObject({
    name,
    notes: optionalNotes,
    templateId: z.uuid().nullable().default(null),
    startedAt: instant,
    endedAt: instant,
    timeZone: ianaTimeZone,
    exercises: z.array(exerciseSchema).max(MAX_EXERCISES_PER_PLAN),
  })
  .meta({ id: 'WorkoutInput' });

export class WorkoutInputDto extends createZodDto(workoutInputSchema) {}

export type WorkoutInput = z.output<typeof workoutInputSchema>;

export class WorkoutIdParamsDto extends createIdParamsDto('WorkoutIdParams') {}

export const listWorkoutsQuerySchema = z
  .object(paginationShape({ defaultLimit: 20, maxLimit: 50 }))
  .meta({ id: 'ListWorkoutsQuery' });

export class ListWorkoutsQueryDto extends createZodDto(
  listWorkoutsQuerySchema,
) {}

export const previousSetsQuerySchema = z
  .object({
    exerciseIds: commaList(z.uuid(), {
      min: 1,
      max: MAX_EXERCISES_PER_PLAN,
    }).meta({
      description:
        'Comma-separated exercise ids, up to 50; exercises without history are omitted from the answer',
    }),
  })
  .meta({ id: 'PreviousSetsQuery' });

export class PreviousSetsQueryDto extends createZodDto(
  previousSetsQuerySchema,
) {}
