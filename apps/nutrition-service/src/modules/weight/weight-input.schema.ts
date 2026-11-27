import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localDate, optionalText } from '../../common/validation';

const today = localDate.meta({
  description: 'The date today in the time zone of the user',
});

export const weightInputSchema = z
  .strictObject({
    weightKg: z
      .number()
      .min(20)
      .max(400)
      .transform((value) => Math.round(value * 1000) / 1000),
    note: optionalText(200),
    today,
  })
  .meta({ id: 'WeightInput' });

export class WeightInputDto extends createZodDto(weightInputSchema) {}

export type WeightInput = z.output<typeof weightInputSchema>;

export const weightDateParamsSchema = z
  .object({ date: localDate })
  .meta({ id: 'WeightDateParams' });

export class WeightDateParamsDto extends createZodDto(weightDateParamsSchema) {}

export const removeWeightQuerySchema = z
  .object({ today })
  .meta({ id: 'RemoveWeightQuery' });

export class RemoveWeightQueryDto extends createZodDto(
  removeWeightQuerySchema,
) {}

export const listWeightQuerySchema = z
  .object({
    from: localDate.optional(),
    to: localDate.optional(),
    limit: z.coerce.number().int().min(1).max(400).default(100),
  })
  .meta({ id: 'ListWeightQuery' });

export class ListWeightQueryDto extends createZodDto(listWeightQuerySchema) {}
