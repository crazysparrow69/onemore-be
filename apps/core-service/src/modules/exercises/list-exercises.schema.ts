import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EQUIPMENT, PRIMARY_MUSCLES } from '../../db/schema/exercises';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

function commaSeparated<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z
    .string()
    .transform((value) => value.split(',').filter((item) => item.length > 0))
    .pipe(z.array(z.enum(values)).max(values.length));
}

export const listExercisesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional().meta({
      description:
        'Search text: every word must match an exercise name or alias, a muscle or equipment label, in any language',
    }),
    muscle: commaSeparated(PRIMARY_MUSCLES).optional().meta({
      description: 'Comma-separated primary muscles; any of them matches',
    }),
    equipment: commaSeparated(EQUIPMENT).optional().meta({
      description: 'Comma-separated equipment; any of them matches',
    }),
    mine: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .meta({
        description: 'true limits the list to exercises created by the caller',
      }),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .meta({ id: 'ListExercisesQuery' });

export class ListExercisesQueryDto extends createZodDto(
  listExercisesQuerySchema,
) {}

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;

export const exerciseIdParamsSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'ExerciseIdParams' });

export class ExerciseIdParamsDto extends createZodDto(exerciseIdParamsSchema) {}
