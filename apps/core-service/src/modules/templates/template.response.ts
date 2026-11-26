import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import { SET_KINDS } from '../../db/schema/workouts';

const instant = z.string().meta({ format: 'date-time' });

const templateSet = z
  .object({
    kind: z.enum(SET_KINDS),
    weightKg: z.number().nullable(),
    reps: z.number().int().nullable(),
    durationS: z.number().int().nullable(),
    distanceM: z.number().nullable(),
  })
  .meta({ id: 'TemplateSet' });

const templateExercise = z
  .object({
    exerciseId: z.uuid(),
    name: z.string(),
    image: z.string().nullable(),
    type: z.enum(EXERCISE_TYPES),
    custom: z.boolean(),
    archived: z.boolean(),
    notes: z.string().nullable(),
    restSeconds: z.number().int().nullable(),
    sets: z.array(templateSet),
  })
  .meta({ id: 'TemplateExercise' });

export const templateSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    notes: z.string().nullable(),
    createdAt: instant,
    updatedAt: instant,
    lastPerformedAt: instant.nullable(),
    exercises: z.array(templateExercise),
  })
  .meta({ id: 'Template' });

export const templateListResponseSchema = z
  .object({ items: z.array(templateSchema) })
  .meta({ id: 'TemplateListResponse' });

export class TemplateDto extends createZodDto(templateSchema) {}
export class TemplateListResponseDto extends createZodDto(
  templateListResponseSchema,
) {}

export type Template = z.infer<typeof templateSchema>;
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>;
