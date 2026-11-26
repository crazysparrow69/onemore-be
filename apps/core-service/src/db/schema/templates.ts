import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { exercises, VISIBILITIES, type ExerciseType } from './exercises';
import { timestamps } from './columns';
import { coreSchema, users } from './users';
import { SET_KINDS, type SetKind } from './workouts';

function oneOf(column: string, values: readonly string[]) {
  return sql.raw(
    `${column} in (${values.map((value) => `'${value}'`).join(', ')})`,
  );
}

export const templates = coreSchema.table(
  'templates',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    visibility: text('visibility')
      .$type<(typeof VISIBILITIES)[number]>()
      .notNull()
      .default('private'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check('templates_visibility_check', oneOf('visibility', VISIBILITIES)),
    index('templates_owner_active_idx')
      .on(table.ownerId, table.createdAt)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const templateExercises = coreSchema.table(
  'template_exercises',
  {
    id: uuid('id').primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').notNull(),
    exerciseType: text('exercise_type').$type<ExerciseType>().notNull(),
    position: smallint('position').notNull(),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'template_exercises_exercise_fk',
      columns: [table.exerciseId, table.exerciseType],
      foreignColumns: [exercises.id, exercises.type],
    }),
    unique('template_exercises_template_position_unique').on(
      table.templateId,
      table.position,
    ),
    unique('template_exercises_id_type_unique').on(
      table.id,
      table.exerciseType,
    ),
    index('template_exercises_exercise_idx').on(table.exerciseId),
    check('template_exercises_position_check', sql`${table.position} >= 0`),
    check(
      'template_exercises_rest_check',
      sql`${table.restSeconds} is null or ${table.restSeconds} >= 0`,
    ),
  ],
);

export const templateSets = coreSchema.table(
  'template_sets',
  {
    id: uuid('id').primaryKey(),
    templateExerciseId: uuid('template_exercise_id').notNull(),
    exerciseType: text('exercise_type').$type<ExerciseType>().notNull(),
    position: smallint('position').notNull(),
    kind: text('kind').$type<SetKind>().notNull().default('working'),
    weightKg: numeric('weight_kg', {
      precision: 7,
      scale: 3,
      mode: 'number',
    }),
    reps: integer('reps'),
    durationS: integer('duration_s'),
    distanceM: numeric('distance_m', {
      precision: 9,
      scale: 2,
      mode: 'number',
    }),
  },
  (table) => [
    foreignKey({
      name: 'template_sets_template_exercise_fk',
      columns: [table.templateExerciseId, table.exerciseType],
      foreignColumns: [templateExercises.id, templateExercises.exerciseType],
    }).onDelete('cascade'),
    unique('template_sets_exercise_position_unique').on(
      table.templateExerciseId,
      table.position,
    ),
    check('template_sets_kind_check', oneOf('kind', SET_KINDS)),
    check('template_sets_position_check', sql`${table.position} >= 0`),
    check(
      'template_sets_shape_check',
      sql`case ${table.exerciseType}
        when 'weight_reps' then duration_s is null and distance_m is null
        when 'bodyweight_reps' then duration_s is null and distance_m is null
        when 'duration' then weight_kg is null and reps is null and distance_m is null
        when 'distance_duration' then weight_kg is null and reps is null
        when 'weight_distance' then reps is null
        else false
      end`,
    ),
    check(
      'template_sets_values_check',
      sql`(reps is null or reps >= 0) and (duration_s is null or duration_s > 0) and (distance_m is null or distance_m > 0) and (weight_kg is null or weight_kg >= 0 or exercise_type = 'bodyweight_reps')`,
    ),
  ],
);
