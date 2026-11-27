import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { instantResponse } from '../../common/response';
import { AMOUNT_UNITS, MEALS } from '../../db/schema';
import type { SuggestionRow } from './food-suggestions.repository';

export const suggestionResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    amount: z.number().nullable(),
    unit: z.enum(AMOUNT_UNITS).nullable(),
    meal: z.enum(MEALS).nullable(),
    caloriesKcal: z.number().int(),
    proteinG: z.number().nullable(),
    fatG: z.number().nullable(),
    carbsG: z.number().nullable(),
    useCount: z.number().int(),
    lastUsedAt: instantResponse,
  })
  .meta({ id: 'FoodSuggestion' });

export const suggestionListResponseSchema = z
  .object({ items: z.array(suggestionResponseSchema) })
  .meta({ id: 'FoodSuggestionListResponse' });

export class SuggestionListResponseDto extends createZodDto(
  suggestionListResponseSchema,
) {}

export type SuggestionListResponse = z.infer<
  typeof suggestionListResponseSchema
>;

export function toSuggestionResponse(
  row: SuggestionRow,
): z.infer<typeof suggestionResponseSchema> {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    meal: row.meal,
    caloriesKcal: row.caloriesKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}
