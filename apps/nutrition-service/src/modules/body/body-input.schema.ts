import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ageOn } from '../../common/dates';
import { localDate } from '../../common/validation';
import { ACTIVITY_LEVELS, SEXES } from '../../db/schema';
import {
  FAT_SHARE_PERCENT_RANGE,
  PROTEIN_G_PER_KG_RANGE,
} from '../targets/target-formula';

export const MIN_AGE = 13;
export const MAX_AGE = 120;

export const bodyInputSchema = z
  .strictObject({
    sex: z.enum(SEXES),
    birthDate: localDate,
    heightCm: z
      .number()
      .min(100)
      .max(250)
      .transform((value) => Math.round(value * 10) / 10),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    proteinGPerKg: z
      .number()
      .min(PROTEIN_G_PER_KG_RANGE.min)
      .max(PROTEIN_G_PER_KG_RANGE.max)
      .transform((value) => Math.round(value * 10) / 10)
      .nullish()
      .transform((value) => value ?? null)
      .meta({
        description:
          'Own protein in grams per kilogram of body weight; null means the formula decides',
      }),
    fatSharePercent: z
      .number()
      .int()
      .min(FAT_SHARE_PERCENT_RANGE.min)
      .max(FAT_SHARE_PERCENT_RANGE.max)
      .nullish()
      .transform((value) => value ?? null)
      .meta({
        description:
          'Own share of calories from fat in percent; null means the formula decides',
      }),
    today: localDate.meta({
      description: 'The date today in the time zone of the user',
    }),
  })
  .superRefine((input, context) => {
    const age = ageOn(input.birthDate, input.today);
    if (age < MIN_AGE || age > MAX_AGE) {
      context.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: `age must be between ${MIN_AGE} and ${MAX_AGE}`,
      });
    }
  })
  .meta({ id: 'BodyInput' });

export class BodyInputDto extends createZodDto(bodyInputSchema) {}

export type BodyInput = z.output<typeof bodyInputSchema>;
