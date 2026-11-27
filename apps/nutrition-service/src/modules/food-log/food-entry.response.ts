import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { dateResponse, instantResponse } from '../../common/response';
import { AMOUNT_UNITS, ENTRY_SOURCES, MEALS } from '../../db/schema';
import { dailyTargetSchema } from '../targets/target.response';
import type { EntryRow } from './food-log.repository';

export const foodEntryResponseSchema = z
  .object({
    id: z.uuid(),
    localDate: dateResponse,
    meal: z.enum(MEALS),
    name: z.string(),
    amount: z.number().nullable(),
    unit: z.enum(AMOUNT_UNITS).nullable(),
    caloriesKcal: z.number().int(),
    proteinG: z.number().nullable(),
    fatG: z.number().nullable(),
    carbsG: z.number().nullable(),
    source: z.enum(ENTRY_SOURCES),
    createdAt: instantResponse,
  })
  .meta({ id: 'FoodEntry' });

const totals = z
  .object({
    caloriesKcal: z.number().int(),
    proteinG: z.number(),
    fatG: z.number(),
    carbsG: z.number(),
  })
  .meta({ id: 'NutritionTotals' });

export const dayResponseSchema = z
  .object({
    date: dateResponse,
    entries: z.array(foodEntryResponseSchema),
    totals,
    target: dailyTargetSchema.nullable(),
    remaining: totals.nullable().meta({
      description:
        'Target minus eaten, negative when the day is overeaten; null when there is no target yet',
    }),
  })
  .meta({ id: 'DayResponse' });

const daySummary = z
  .object({
    date: dateResponse,
    entryCount: z.number().int(),
    totals,
    target: dailyTargetSchema.nullable(),
  })
  .meta({ id: 'DaySummary' });

export const daysResponseSchema = z
  .object({ items: z.array(daySummary) })
  .meta({ id: 'DaysResponse' });

export class FoodEntryResponseDto extends createZodDto(
  foodEntryResponseSchema,
) {}
export class DayResponseDto extends createZodDto(dayResponseSchema) {}
export class DaysResponseDto extends createZodDto(daysResponseSchema) {}

export type FoodEntryResponse = z.infer<typeof foodEntryResponseSchema>;
export type DayResponse = z.infer<typeof dayResponseSchema>;
export type DaysResponse = z.infer<typeof daysResponseSchema>;

export function toFoodEntryResponse(row: EntryRow): FoodEntryResponse {
  return {
    id: row.id,
    localDate: row.localDate,
    meal: row.meal,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    caloriesKcal: row.caloriesKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}
