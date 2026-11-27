import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks';
import { timestamps } from './columns';
import { nutritionSchema } from './nutrition-schema';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export const AMOUNT_UNITS = ['g', 'ml', 'pcs', 'serving'] as const;
export type AmountUnit = (typeof AMOUNT_UNITS)[number];

export const ENTRY_SOURCES = ['manual', 'suggestion'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

const macro = (name: string) =>
  numeric(name, { precision: 5, scale: 1, mode: 'number' });

const amount = () =>
  numeric('amount', { precision: 7, scale: 1, mode: 'number' });

export const userFoods = nutritionSchema.table(
  'user_foods',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    amount: amount(),
    unit: text('unit').$type<AmountUnit>(),
    meal: text('meal').$type<Meal>(),
    caloriesKcal: integer('calories_kcal').notNull(),
    proteinG: macro('protein_g'),
    fatG: macro('fat_g'),
    carbsG: macro('carbs_g'),
    useCount: integer('use_count').notNull().default(1),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique('user_foods_user_name_key_unique').on(table.userId, table.nameKey),
    index('user_foods_user_last_used_idx').on(
      table.userId,
      sql`${table.lastUsedAt} desc`,
    ),
    check(
      'user_foods_name_check',
      sql`char_length(${table.name}) between 1 and 200 and char_length(${table.nameKey}) between 1 and 200`,
    ),
    check(
      'user_foods_meal_check',
      sql`${table.meal} is null or ${oneOf('meal', MEALS)}`,
    ),
    check(
      'user_foods_unit_check',
      sql`${table.unit} is null or ${oneOf('unit', AMOUNT_UNITS)}`,
    ),
    check(
      'user_foods_amount_check',
      sql`(${table.amount} is null) = (${table.unit} is null) and (${table.amount} is null or ${table.amount} > 0)`,
    ),
    check(
      'user_foods_values_check',
      sql`${table.caloriesKcal} between 0 and 10000 and (${table.proteinG} is null or ${table.proteinG} between 0 and 1000) and (${table.fatG} is null or ${table.fatG} between 0 and 1000) and (${table.carbsG} is null or ${table.carbsG} between 0 and 1000)`,
    ),
    check('user_foods_use_count_check', sql`${table.useCount} >= 1`),
  ],
);

export const foodEntries = nutritionSchema.table(
  'food_entries',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    meal: text('meal').$type<Meal>().notNull(),
    name: text('name').notNull(),
    amount: amount(),
    unit: text('unit').$type<AmountUnit>(),
    caloriesKcal: integer('calories_kcal').notNull(),
    proteinG: macro('protein_g'),
    fatG: macro('fat_g'),
    carbsG: macro('carbs_g'),
    source: text('source').$type<EntrySource>().notNull(),
    userFoodId: uuid('user_food_id').references(() => userFoods.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('food_entries_user_date_idx').on(table.userId, table.localDate),
    check('food_entries_meal_check', oneOf('meal', MEALS)),
    check('food_entries_source_check', oneOf('source', ENTRY_SOURCES)),
    check(
      'food_entries_unit_check',
      sql`${table.unit} is null or ${oneOf('unit', AMOUNT_UNITS)}`,
    ),
    check(
      'food_entries_name_check',
      sql`char_length(${table.name}) between 1 and 200`,
    ),
    check(
      'food_entries_amount_check',
      sql`(${table.amount} is null) = (${table.unit} is null) and (${table.amount} is null or ${table.amount} > 0)`,
    ),
    check(
      'food_entries_values_check',
      sql`${table.caloriesKcal} between 0 and 10000 and (${table.proteinG} is null or ${table.proteinG} between 0 and 1000) and (${table.fatG} is null or ${table.fatG} between 0 and 1000) and (${table.carbsG} is null or ${table.carbsG} between 0 and 1000)`,
    ),
  ],
);
