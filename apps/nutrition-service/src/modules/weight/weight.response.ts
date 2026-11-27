import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { dateResponse, instantResponse } from '../../common/response';
import type { WeightRow } from './weight.repository';

export const weightResponseSchema = z
  .object({
    localDate: dateResponse,
    weightKg: z.number(),
    note: z.string().nullable(),
    updatedAt: instantResponse,
  })
  .meta({ id: 'WeightResponse' });

export const weightListResponseSchema = z
  .object({ items: z.array(weightResponseSchema) })
  .meta({ id: 'WeightListResponse' });

export class WeightResponseDto extends createZodDto(weightResponseSchema) {}
export class WeightListResponseDto extends createZodDto(
  weightListResponseSchema,
) {}

export type WeightResponse = z.infer<typeof weightResponseSchema>;
export type WeightListResponse = z.infer<typeof weightListResponseSchema>;

export function toWeightResponse(row: WeightRow): WeightResponse {
  return {
    localDate: row.localDate,
    weightKg: row.weightKg,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}
