import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { daysBetween } from '../../common/dates';
import {
  cleanText,
  createIdParamsDto,
  localDate,
} from '../../common/validation';
import { AMOUNT_UNITS, ENTRY_SOURCES, MEALS } from '../../db/schema';

export const MAX_ENTRIES_PER_DAY = 100;
export const MAX_DAYS_IN_RANGE = 62;

const tenth = (value: number) => Math.round(value * 10) / 10;

const macro = z
  .number()
  .min(0)
  .max(1000)
  .transform(tenth)
  .nullable()
  .default(null);

export const foodEntryInputSchema = z
  .strictObject({
    localDate,
    meal: z.enum(MEALS),
    name: cleanText({ min: 1, max: 200 }),
    amount: z
      .number()
      .positive()
      .max(99999)
      .transform(tenth)
      .nullable()
      .default(null),
    unit: z.enum(AMOUNT_UNITS).nullable().default(null),
    caloriesKcal: z.number().int().min(0).max(10000),
    proteinG: macro,
    fatG: macro,
    carbsG: macro,
    source: z.enum(ENTRY_SOURCES).default('manual'),
  })
  .superRefine((input, context) => {
    if ((input.amount === null) !== (input.unit === null)) {
      context.addIssue({
        code: 'custom',
        path: [input.amount === null ? 'amount' : 'unit'],
        message: 'amount and unit are given together or not at all',
      });
    }
  })
  .meta({ id: 'FoodEntryInput' });

export class FoodEntryInputDto extends createZodDto(foodEntryInputSchema) {}

export type FoodEntryInput = z.output<typeof foodEntryInputSchema>;

export class FoodEntryIdParamsDto extends createIdParamsDto(
  'FoodEntryIdParams',
) {}

export const dayParamsSchema = z
  .object({ date: localDate })
  .meta({ id: 'DayParams' });

export class DayParamsDto extends createZodDto(dayParamsSchema) {}

export const daysQuerySchema = z
  .object({ from: localDate, to: localDate })
  .refine(
    ({ from, to }) => {
      const span = daysBetween(from, to);
      return span >= 0 && span < MAX_DAYS_IN_RANGE;
    },
    { message: `from must not be after to, at most ${MAX_DAYS_IN_RANGE} days` },
  )
  .meta({ id: 'DaysQuery' });

export class DaysQueryDto extends createZodDto(daysQuerySchema) {}
