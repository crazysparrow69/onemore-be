import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { cleanText, MAX_NAME_LENGTH } from '../../common/validation';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLES,
  PRIMARY_MUSCLES,
  PRIMARY_ONLY_GROUPS,
} from '../../db/schema/exercises';

export const MAX_CUSTOM_EXERCISES = 500;
export const MAX_PRIMARY_MUSCLES = 3;
export const MAX_INSTRUCTION_STEPS = 20;
export const MAX_STEP_LENGTH = 500;

const name = cleanText({ min: 2, max: MAX_NAME_LENGTH });

const instructions = z
  .array(z.string().trim().max(MAX_STEP_LENGTH))
  .max(MAX_INSTRUCTION_STEPS)
  .transform((steps) => steps.filter((step) => step.length > 0));

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const exerciseInputSchema = z
  .strictObject({
    name,
    type: z.enum(EXERCISE_TYPES),
    primaryMuscles: z
      .array(z.enum(PRIMARY_MUSCLES))
      .min(1)
      .max(MAX_PRIMARY_MUSCLES),
    secondaryMuscles: z.array(z.enum(MUSCLES)).max(MUSCLES.length).default([]),
    equipment: z.enum(EQUIPMENT).default('none'),
    instructions: instructions.default([]),
    photoId: z.uuid().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (hasDuplicates(value.primaryMuscles)) {
      context.addIssue({
        code: 'custom',
        path: ['primaryMuscles'],
        message: 'must not repeat a muscle',
      });
    }
    if (hasDuplicates(value.secondaryMuscles)) {
      context.addIssue({
        code: 'custom',
        path: ['secondaryMuscles'],
        message: 'must not repeat a muscle',
      });
    }
    const hasGroup = value.primaryMuscles.some((muscle) =>
      (PRIMARY_ONLY_GROUPS as readonly string[]).includes(muscle),
    );
    if (hasGroup && value.primaryMuscles.length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['primaryMuscles'],
        message:
          'full_body, cardio and other cannot be combined with other muscles',
      });
    }
    if (
      value.secondaryMuscles.some((muscle) =>
        (value.primaryMuscles as readonly string[]).includes(muscle),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['secondaryMuscles'],
        message: 'must not include a primary muscle',
      });
    }
  })
  .meta({ id: 'ExerciseInput' });

export class ExerciseInputDto extends createZodDto(exerciseInputSchema) {}

export type ExerciseInput = z.output<typeof exerciseInputSchema>;
