import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  GOAL_TYPES,
  SEXES,
  TARGET_SOURCES,
} from '../../db/schema';
import { dateResponse } from '../../common/response';
import type { SnapshotRow } from './targets.repository';

const targetInputs = z
  .object({
    sex: z.enum(SEXES),
    age: z.number().int(),
    heightCm: z.number(),
    weightKg: z.number(),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    goalType: z.enum(GOAL_TYPES),
    rateKgPerWeek: z.number().nullable(),
    proteinGPerKg: z.number().optional(),
    fatSharePercent: z.number().int().optional(),
  })
  .meta({ id: 'TargetInputs' });

export const targetResponseSchema = z
  .object({
    effectiveFrom: dateResponse,
    source: z.enum(TARGET_SOURCES),
    caloriesKcal: z.number().int(),
    proteinG: z.number().int(),
    fatG: z.number().int(),
    carbsG: z.number().int(),
    bmrKcal: z.number().int().nullable(),
    tdeeKcal: z.number().int().nullable(),
    floorApplied: z.boolean(),
    inputs: targetInputs.nullable(),
  })
  .meta({ id: 'TargetResponse' });

export class TargetResponseDto extends createZodDto(targetResponseSchema) {}

export type TargetResponse = z.infer<typeof targetResponseSchema>;

export const dailyTargetSchema = z
  .object({
    caloriesKcal: z.number().int(),
    proteinG: z.number().int(),
    fatG: z.number().int(),
    carbsG: z.number().int(),
  })
  .meta({ id: 'DailyTarget' });

export type DailyTarget = z.infer<typeof dailyTargetSchema>;

export function toTargetResponse(row: SnapshotRow): TargetResponse {
  return {
    effectiveFrom: row.effectiveFrom,
    source: row.source,
    caloriesKcal: row.caloriesKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
    bmrKcal: row.bmrKcal,
    tdeeKcal: row.tdeeKcal,
    floorApplied: row.floorApplied,
    inputs: row.inputs,
  };
}

export function toDailyTarget(row: SnapshotRow): DailyTarget {
  return {
    caloriesKcal: row.caloriesKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
  };
}
