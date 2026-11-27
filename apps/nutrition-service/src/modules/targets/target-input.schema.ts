import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localDate } from '../../common/validation';

const today = localDate.meta({
  description: 'The date today in the time zone of the user',
});

export const autoTargetInputSchema = z
  .strictObject({ today })
  .meta({ id: 'AutoTargetInput' });

export class AutoTargetInputDto extends createZodDto(autoTargetInputSchema) {}

export const manualTargetInputSchema = z
  .strictObject({
    caloriesKcal: z.number().int().min(1000).max(6000),
    today,
  })
  .meta({ id: 'ManualTargetInput' });

export class ManualTargetInputDto extends createZodDto(
  manualTargetInputSchema,
) {}

export const targetQuerySchema = z
  .object({ date: localDate })
  .meta({ id: 'TargetQuery' });

export class TargetQueryDto extends createZodDto(targetQuerySchema) {}
