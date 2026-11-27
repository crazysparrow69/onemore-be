import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { LOCALES, type Locale } from './locales';
import { timestamps } from './columns';
import { coreSchema, users } from './users';
import { mediaAssets } from './media';

export const EXERCISE_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'duration',
  'distance_duration',
  'weight_distance',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const MUSCLES = [
  'chest',
  'lats',
  'upper_back',
  'lower_back',
  'traps',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abdominals',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
  'neck',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const PRIMARY_ONLY_GROUPS = ['full_body', 'cardio', 'other'] as const;
export type PrimaryOnlyGroup = (typeof PRIMARY_ONLY_GROUPS)[number];

export const PRIMARY_MUSCLES = [...MUSCLES, ...PRIMARY_ONLY_GROUPS] as const;
export type PrimaryMuscle = (typeof PRIMARY_MUSCLES)[number];

export const EQUIPMENT = [
  'none',
  'barbell',
  'ez_bar',
  'trap_bar',
  'dumbbell',
  'kettlebell',
  'plate',
  'machine',
  'cable',
  'smith_machine',
  'suspension',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roll',
  'other',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_CATEGORIES = [
  'strength',
  'powerlifting',
  'olympic_weightlifting',
  'strongman',
  'cardio',
  'stretching',
  'plyometrics',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_FORCES = ['push', 'pull', 'static'] as const;
export type ExerciseForce = (typeof EXERCISE_FORCES)[number];

export const EXERCISE_MECHANICS = ['compound', 'isolation'] as const;
export type ExerciseMechanic = (typeof EXERCISE_MECHANICS)[number];

export const EXERCISE_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

export const EXERCISE_SOURCES = [
  'free-exercise-db',
  'onemore',
  'user',
] as const;
export type ExerciseSource = (typeof EXERCISE_SOURCES)[number];

export const VISIBILITIES = ['private', 'link', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

function oneOf(column: string, values: readonly string[]): SQL {
  return sql.raw(
    `${column} in (${values.map((value) => `'${value}'`).join(', ')})`,
  );
}

function textArray(values: readonly string[]): string {
  return `array[${values.map((value) => `'${value}'`).join(', ')}]::text[]`;
}

export const exercises = coreSchema.table(
  'exercises',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    source: text('source').$type<ExerciseSource>().notNull(),
    sourceId: text('source_id'),
    visibility: text('visibility').$type<Visibility>().notNull(),
    type: text('type').$type<ExerciseType>().notNull(),
    primaryMuscles: text('primary_muscles')
      .array()
      .$type<PrimaryMuscle[]>()
      .notNull(),
    secondaryMuscles: text('secondary_muscles')
      .array()
      .$type<Muscle[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    equipment: text('equipment').$type<Equipment>().notNull().default('none'),
    category: text('category').$type<ExerciseCategory>(),
    force: text('force').$type<ExerciseForce>(),
    mechanic: text('mechanic').$type<ExerciseMechanic>(),
    level: text('level').$type<ExerciseLevel>(),
    imageKeys: text('image_keys')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    photoId: uuid('photo_id')
      .unique()
      .references(() => mediaAssets.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('exercises_source_source_id_unique').on(
      table.source,
      table.sourceId,
    ),
    unique('exercises_id_type_unique').on(table.id, table.type),
    index('exercises_owner_id_idx')
      .on(table.ownerId)
      .where(sql`${table.ownerId} is not null`),
    check(
      'exercises_owner_check',
      sql`(owner_id is null and source <> 'user' and source_id is not null and visibility = 'public') or (owner_id is not null and source = 'user')`,
    ),
    check('exercises_source_check', oneOf('source', EXERCISE_SOURCES)),
    check('exercises_visibility_check', oneOf('visibility', VISIBILITIES)),
    check('exercises_type_check', oneOf('type', EXERCISE_TYPES)),
    check(
      'exercises_primary_muscles_check',
      sql.raw(
        `cardinality(primary_muscles) >= 1 and primary_muscles <@ ${textArray(PRIMARY_MUSCLES)}`,
      ),
    ),
    check(
      'exercises_secondary_muscles_check',
      sql.raw(
        `secondary_muscles <@ ${textArray(MUSCLES)} and not (primary_muscles && secondary_muscles)`,
      ),
    ),
    check('exercises_equipment_check', oneOf('equipment', EQUIPMENT)),
    check('exercises_category_check', oneOf('category', EXERCISE_CATEGORIES)),
    check('exercises_force_check', oneOf('force', EXERCISE_FORCES)),
    check('exercises_mechanic_check', oneOf('mechanic', EXERCISE_MECHANICS)),
    check('exercises_level_check', oneOf('level', EXERCISE_LEVELS)),
  ],
);

export const exerciseTranslations = coreSchema.table(
  'exercise_translations',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<Locale>().notNull(),
    name: text('name').notNull(),
    instructions: text('instructions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [
    primaryKey({ columns: [table.exerciseId, table.locale] }),
    check('exercise_translations_locale_check', oneOf('locale', LOCALES)),
  ],
);

export const exerciseStats = coreSchema.table(
  'exercise_stats',
  {
    exerciseId: uuid('exercise_id')
      .primaryKey()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    usersCount: integer('users_count').notNull().default(0),
  },
  (table) => [
    check('exercise_stats_users_count_check', sql`${table.usersCount} >= 0`),
  ],
);
