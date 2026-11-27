import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks';
import type { ActivityLevel, Sex } from './body-profiles';
import { goals, type GoalType } from './goals';
import { nutritionSchema } from './nutrition-schema';

export const TARGET_SOURCES = ['auto', 'manual'] as const;
export type TargetSource = (typeof TARGET_SOURCES)[number];

export type TargetInputs = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  rateKgPerWeek: number | null;
};

export const targetSnapshots = nutritionSchema.table(
  'target_snapshots',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    source: text('source').$type<TargetSource>().notNull(),
    goalId: uuid('goal_id').references(() => goals.id, {
      onDelete: 'set null',
    }),
    caloriesKcal: integer('calories_kcal').notNull(),
    proteinG: integer('protein_g').notNull(),
    fatG: integer('fat_g').notNull(),
    carbsG: integer('carbs_g').notNull(),
    bmrKcal: integer('bmr_kcal'),
    tdeeKcal: integer('tdee_kcal'),
    floorApplied: boolean('floor_applied').notNull().default(false),
    formulaVersion: smallint('formula_version'),
    inputs: jsonb('inputs').$type<TargetInputs>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('target_snapshots_user_effective_from_unique').on(
      table.userId,
      table.effectiveFrom,
    ),
    check('target_snapshots_source_check', oneOf('source', TARGET_SOURCES)),
    check(
      'target_snapshots_source_shape_check',
      sql`(${table.source} = 'auto') = (${table.formulaVersion} is not null and ${table.inputs} is not null)`,
    ),
    check(
      'target_snapshots_calories_check',
      sql`${table.caloriesKcal} between 800 and 8000`,
    ),
    check(
      'target_snapshots_macros_check',
      sql`${table.proteinG} >= 0 and ${table.fatG} >= 0 and ${table.carbsG} >= 0`,
    ),
  ],
);
