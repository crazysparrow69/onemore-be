import { sql } from 'drizzle-orm';
import {
  check,
  date,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks';
import { nutritionSchema } from './nutrition-schema';

export const GOAL_TYPES = ['lose', 'maintain', 'gain', 'recomp'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const goals = nutritionSchema.table(
  'goals',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    type: text('type').$type<GoalType>().notNull(),
    rateKgPerWeek: numeric('rate_kg_per_week', {
      precision: 3,
      scale: 2,
      mode: 'number',
    }),
    targetWeightKg: numeric('target_weight_kg', {
      precision: 7,
      scale: 3,
      mode: 'number',
    }),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('goals_user_effective_from_unique').on(
      table.userId,
      table.effectiveFrom,
    ),
    check('goals_type_check', oneOf('type', GOAL_TYPES)),
    check(
      'goals_rate_presence_check',
      sql`(${table.type} in ('lose', 'gain')) = (${table.rateKgPerWeek} is not null)`,
    ),
    check(
      'goals_rate_range_check',
      sql`${table.rateKgPerWeek} is null or ${table.rateKgPerWeek} between 0.10 and 1.00`,
    ),
    check(
      'goals_target_weight_check',
      sql`${table.targetWeightKg} is null or ${table.targetWeightKg} between 20 and 400`,
    ),
  ],
);
