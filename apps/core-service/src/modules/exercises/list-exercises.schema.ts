import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  commaList,
  createIdParamsDto,
  idParams,
  paginationShape,
} from '../../common/validation';
import { EQUIPMENT, PRIMARY_MUSCLES } from '../../db/schema/exercises';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export const listExercisesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional().meta({
      description:
        'Search text: every word must match an exercise name or alias, a muscle or equipment label, in any language',
    }),
    muscle: commaList(z.enum(PRIMARY_MUSCLES), {
      max: PRIMARY_MUSCLES.length,
    })
      .optional()
      .meta({
        description: 'Comma-separated primary muscles; any of them matches',
      }),
    equipment: commaList(z.enum(EQUIPMENT), { max: EQUIPMENT.length })
      .optional()
      .meta({
        description: 'Comma-separated equipment; any of them matches',
      }),
    mine: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .meta({
        description: 'true limits the list to exercises created by the caller',
      }),
    ...paginationShape({ defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT }),
  })
  .meta({ id: 'ListExercisesQuery' });

export class ListExercisesQueryDto extends createZodDto(
  listExercisesQuerySchema,
) {}

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;

export const exerciseIdParamsSchema = idParams('ExerciseIdParams');

export class ExerciseIdParamsDto extends createIdParamsDto(
  'ExerciseIdParams',
) {}
