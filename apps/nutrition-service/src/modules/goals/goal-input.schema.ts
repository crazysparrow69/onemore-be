import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { localDate } from '../../common/validation';
import { GOAL_TYPES } from '../../db/schema';

export const goalInputSchema = z
  .strictObject({
    type: z.enum(GOAL_TYPES),
    rateKgPerWeek: z
      .number()
      .min(0.1)
      .max(1)
      .transform((value) => Math.round(value * 100) / 100)
      .nullable()
      .default(null)
      .meta({
        description:
          'Kilograms per week, 0.1 to 1. Required for lose and gain, ignored for maintain and recomp',
      }),
    targetWeightKg: z
      .number()
      .min(20)
      .max(400)
      .transform((value) => Math.round(value * 1000) / 1000)
      .nullable()
      .default(null),
    today: localDate.meta({
      description: 'The date today in the time zone of the user',
    }),
  })
  .superRefine((input, context) => {
    const directional = input.type === 'lose' || input.type === 'gain';
    if (directional && input.rateKgPerWeek === null) {
      context.addIssue({
        code: 'custom',
        path: ['rateKgPerWeek'],
        message: 'is required for lose and gain',
      });
    }
  })
  .meta({ id: 'GoalInput' });

export class GoalInputDto extends createZodDto(goalInputSchema) {}

export type GoalInput = z.output<typeof goalInputSchema>;
