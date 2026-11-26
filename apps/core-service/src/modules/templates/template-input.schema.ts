import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  MAX_NAME_LENGTH,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  MIN_REST_SECONDS,
  notes,
  setValueShape,
} from '../workouts/workout-input.schema';

export const MAX_TEMPLATE_EXERCISES = MAX_WORKOUT_EXERCISES;
export const MAX_TEMPLATE_SETS = MAX_SETS_PER_EXERCISE;
export const MAX_TEMPLATES = 100;

const CONTROL_CHARACTER = /(?![\t\n\r\f\v])\p{Cc}/u;

const name = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    message: 'must not contain control characters',
  })
  .transform((value) => value.replace(/\s+/g, ' '));

const setSchema = z
  .strictObject(setValueShape)
  .meta({ id: 'TemplateSetInput' });

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
    sets: z.array(setSchema).min(1).max(MAX_TEMPLATE_SETS),
  })
  .meta({ id: 'TemplateExerciseInput' });

export const templateInputSchema = z
  .strictObject({
    name,
    notes,
    exercises: z.array(exerciseSchema).min(1).max(MAX_TEMPLATE_EXERCISES),
  })
  .meta({ id: 'TemplateInput' });

export class TemplateInputDto extends createZodDto(templateInputSchema) {}

export type TemplateInput = z.output<typeof templateInputSchema>;

export const templateIdParamsSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'TemplateIdParams' });

export class TemplateIdParamsDto extends createZodDto(templateIdParamsSchema) {}
