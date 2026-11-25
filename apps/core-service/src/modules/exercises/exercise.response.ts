import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  EXERCISE_TYPES,
  MUSCLES,
  PRIMARY_MUSCLES,
} from '../../db/schema/exercises';

const listItemFields = {
  id: z.uuid(),
  name: z.string(),
  type: z.enum(EXERCISE_TYPES),
  primaryMuscles: z.array(z.enum(PRIMARY_MUSCLES)),
  secondaryMuscles: z.array(z.enum(MUSCLES)),
  equipment: z.enum(EQUIPMENT),
  image: z.string().nullable(),
};

export const exerciseListItemSchema = z
  .object(listItemFields)
  .meta({ id: 'ExerciseListItem' });

export const exerciseListResponseSchema = z
  .object({
    items: z.array(exerciseListItemSchema),
    total: z.number().int(),
    nextOffset: z.number().int().nullable(),
  })
  .meta({ id: 'ExerciseListResponse' });

export const exerciseDetailsSchema = z
  .object({
    ...listItemFields,
    imageKeys: z.array(z.string()),
    category: z.enum(EXERCISE_CATEGORIES).nullable(),
    force: z.enum(EXERCISE_FORCES).nullable(),
    mechanic: z.enum(EXERCISE_MECHANICS).nullable(),
    level: z.enum(EXERCISE_LEVELS).nullable(),
    instructions: z.array(z.string()),
  })
  .meta({ id: 'ExerciseDetails' });

export class ExerciseListResponseDto extends createZodDto(
  exerciseListResponseSchema,
) {}

export class ExerciseDetailsDto extends createZodDto(exerciseDetailsSchema) {}

export type ExerciseListItem = z.infer<typeof exerciseListItemSchema>;
export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>;
export type ExerciseDetails = z.infer<typeof exerciseDetailsSchema>;
