import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { dateResponse, instantResponse } from '../../common/response';
import { ACTIVITY_LEVELS, SEXES } from '../../db/schema';
import type { BodyRow } from './body.repository';

export const bodyResponseSchema = z
  .object({
    sex: z.enum(SEXES),
    birthDate: dateResponse,
    heightCm: z.number(),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    updatedAt: instantResponse,
  })
  .meta({ id: 'BodyResponse' });

export class BodyResponseDto extends createZodDto(bodyResponseSchema) {}

export type BodyResponse = z.infer<typeof bodyResponseSchema>;

export function toBodyResponse(row: BodyRow): BodyResponse {
  return {
    sex: row.sex,
    birthDate: row.birthDate,
    heightCm: row.heightCm,
    activityLevel: row.activityLevel,
    updatedAt: row.updatedAt.toISOString(),
  };
}
