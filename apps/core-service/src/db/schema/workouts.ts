import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  smallint,
  text,
  timestamp,
  date,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { exercises, type ExerciseType } from './exercises';
import { templates } from './templates';
import { coreSchema, users } from './users';

export const SET_KINDS = ['warmup', 'working', 'drop', 'failure'] as const;
export type SetKind = (typeof SET_KINDS)[number];

function oneOf(column: string, values: readonly string[]): SQL {
  return sql.raw(
    `${column} in (${values.map((value) => `'${value}'`).join(', ')})`,
  );
}

export const workoutSessions = coreSchema.table(
  'workout_sessions',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => templates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    notes: text('notes'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    timeZone: text('time_zone').notNull(),
    bodyWeightKg: numeric('body_weight_kg', {
      precision: 7,
      scale: 3,
      mode: 'number',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'workout_sessions_period_check',
      sql`${table.endedAt} >= ${table.startedAt}`,
    ),
    index('workout_sessions_owner_local_date_idx').on(
      table.ownerId,
      table.localDate,
    ),
    index('workout_sessions_template_idx').on(
      table.templateId,
      sql`${table.startedAt} desc`,
    ),
    index('workout_sessions_owner_started_at_idx').on(
      table.ownerId,
      sql`${table.startedAt} desc`,
    ),
  ],
);

export const sessionExercises = coreSchema.table(
  'session_exercises',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').notNull(),
    exerciseType: text('exercise_type').$type<ExerciseType>().notNull(),
    position: smallint('position').notNull(),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'session_exercises_exercise_fk',
      columns: [table.exerciseId, table.exerciseType],
      foreignColumns: [exercises.id, exercises.type],
    }),
    unique('session_exercises_session_position_unique').on(
      table.sessionId,
      table.position,
    ),
    unique('session_exercises_id_type_unique').on(table.id, table.exerciseType),
    index('session_exercises_exercise_idx').on(
      table.exerciseId,
      table.sessionId,
    ),
    check('session_exercises_position_check', sql`${table.position} >= 0`),
    check(
      'session_exercises_rest_check',
      sql`${table.restSeconds} is null or ${table.restSeconds} >= 0`,
    ),
  ],
);

export const sessionSets = coreSchema.table(
  'session_sets',
  {
    id: uuid('id').primaryKey(),
    sessionExerciseId: uuid('session_exercise_id').notNull(),
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
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'session_sets_session_exercise_fk',
      columns: [table.sessionExerciseId, table.exerciseType],
      foreignColumns: [sessionExercises.id, sessionExercises.exerciseType],
    }).onDelete('cascade'),
    unique('session_sets_exercise_position_unique').on(
      table.sessionExerciseId,
      table.position,
    ),
    check('session_sets_kind_check', oneOf('kind', SET_KINDS)),
    check('session_sets_position_check', sql`${table.position} >= 0`),
    check(
      'session_sets_shape_check',
      sql`case ${table.exerciseType}
        when 'weight_reps' then weight_kg is not null and reps is not null and duration_s is null and distance_m is null
        when 'bodyweight_reps' then reps is not null and duration_s is null and distance_m is null
        when 'duration' then duration_s is not null and weight_kg is null and reps is null and distance_m is null
        when 'distance_duration' then (duration_s is not null or distance_m is not null) and weight_kg is null and reps is null
        when 'weight_distance' then weight_kg is not null and distance_m is not null and reps is null
        else false
      end`,
    ),
    check(
      'session_sets_values_check',
      sql`(reps is null or reps >= 0) and (duration_s is null or duration_s > 0) and (distance_m is null or distance_m > 0) and (weight_kg is null or weight_kg >= 0 or exercise_type = 'bodyweight_reps')`,
    ),
  ],
);
