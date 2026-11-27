import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { dateResponse } from '../../common/response';
import { GOAL_TYPES } from '../../db/schema';
import type { GoalRow } from './goals.repository';

export const goalResponseSchema = z
  .object({
    type: z.enum(GOAL_TYPES),
    rateKgPerWeek: z.number().nullable(),
    targetWeightKg: z.number().nullable(),
    effectiveFrom: dateResponse,
  })
  .meta({ id: 'GoalResponse' });

export class GoalResponseDto extends createZodDto(goalResponseSchema) {}

export type GoalResponse = z.infer<typeof goalResponseSchema>;

export function toGoalResponse(row: GoalRow): GoalResponse {
  return {
    type: row.type,
    rateKgPerWeek: row.rateKgPerWeek,
    targetWeightKg: row.targetWeightKg,
    effectiveFrom: row.effectiveFrom,
  };
}
