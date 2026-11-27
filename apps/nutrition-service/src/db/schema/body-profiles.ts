import { sql } from 'drizzle-orm';
import { check, date, numeric, text } from 'drizzle-orm/pg-core';
import { oneOf } from './checks';
import { timestamps } from './columns';
import { nutritionSchema } from './nutrition-schema';

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const bodyProfiles = nutritionSchema.table(
  'body_profiles',
  {
    userId: text('user_id').primaryKey(),
    sex: text('sex').$type<Sex>().notNull(),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    heightCm: numeric('height_cm', {
      precision: 4,
      scale: 1,
      mode: 'number',
    }).notNull(),
    activityLevel: text('activity_level').$type<ActivityLevel>().notNull(),
    ...timestamps,
  },
  (table) => [
    check('body_profiles_sex_check', oneOf('sex', SEXES)),
    check(
      'body_profiles_activity_check',
      oneOf('activity_level', ACTIVITY_LEVELS),
    ),
    check(
      'body_profiles_height_check',
      sql`${table.heightCm} between 100 and 250`,
    ),
    check(
      'body_profiles_birth_date_check',
      sql`${table.birthDate} >= '1900-01-01'`,
    ),
  ],
);
