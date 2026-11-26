import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { camelizeKeys } from '../../common/camelize';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { lockXact } from '../../db/locks';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import { templates } from '../../db/schema/templates';
import {
  sessionExercises,
  sessionSets,
  workoutSessions,
} from '../../db/schema/workouts';
import {
  bestTranslation,
  lockTypes,
  uuidList,
} from '../exercises/exercise-sql';
import type { PlannedExercise } from '../exercises/prepare-exercises';

export type NewWorkoutExercise = PlannedExercise<{ completedAt: Date }>;

export type NewWorkout = {
  id: string;
  ownerId: string;
  templateId: string | null;
  name: string;
  notes: string | null;
  startedAt: Date;
  endedAt: Date;
  localDate: string;
  timeZone: string;
  exercises: NewWorkoutExercise[];
};

export type SaveResult = 'created' | 'replaced' | 'foreign' | 'stale';

export type SessionRow = typeof workoutSessions.$inferSelect;

export type SessionSetRow = Pick<
  typeof sessionSets.$inferSelect,
  | 'sessionExerciseId'
  | 'kind'
  | 'weightKg'
  | 'reps'
  | 'durationS'
  | 'distanceM'
  | 'completedAt'
>;

const exerciseRowSchema = z
  .object({
    id: z.uuid(),
    session_id: z.uuid(),
    exercise_id: z.uuid(),
    type: z.enum(EXERCISE_TYPES),
    notes: z.string().nullable(),
    rest_seconds: z.number().int().nullable(),
    name: z.string(),
    image_keys: z.array(z.string()),
    custom: z.boolean(),
  })
  .transform(camelizeKeys);

const previousRowSchema = z
  .object({
    session_exercise_id: z.uuid(),
    exercise_id: z.uuid(),
    rest_seconds: z.number().int().nullable(),
    workout_id: z.uuid(),
    started_at: z.coerce.date(),
    local_date: z.string(),
  })
  .transform(camelizeKeys);

export type SessionExerciseRow = z.output<typeof exerciseRowSchema>;
export type PreviousExerciseRow = z.output<typeof previousRowSchema>;

@Injectable()
export class WorkoutsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async save(workout: NewWorkout): Promise<SaveResult> {
    return this.db.transaction(async (tx) => {
      await lockXact(tx, `workout:${workout.id}`);

      const types = await lockTypes(
        tx,
        workout.exercises.map((item) => item.exerciseId),
      );
      if (
        workout.exercises.some(
          (item) => types.get(item.exerciseId) !== item.type,
        )
      ) {
        return 'stale';
      }

      const [existing] = await tx
        .select({ ownerId: workoutSessions.ownerId })
        .from(workoutSessions)
        .where(eq(workoutSessions.id, workout.id))
        .limit(1);
      if (existing && existing.ownerId !== workout.ownerId) {
        return 'foreign';
      }

      const templateId = await this.ownedTemplateId(
        tx,
        workout.ownerId,
        workout.templateId,
      );
      const values = {
        templateId,
        name: workout.name,
        notes: workout.notes,
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        localDate: workout.localDate,
        timeZone: workout.timeZone,
      };
      if (existing) {
        await tx
          .update(workoutSessions)
          .set(values)
          .where(eq(workoutSessions.id, workout.id));
        await tx
          .delete(sessionExercises)
          .where(eq(sessionExercises.sessionId, workout.id));
      } else {
        await tx
          .insert(workoutSessions)
          .values({ id: workout.id, ownerId: workout.ownerId, ...values });
      }

      await tx.insert(sessionExercises).values(
        workout.exercises.map((item, position) => ({
          id: item.id,
          sessionId: workout.id,
          exerciseId: item.exerciseId,
          exerciseType: item.type,
          position,
          notes: item.notes,
          restSeconds: item.restSeconds,
        })),
      );
      await tx.insert(sessionSets).values(
        workout.exercises.flatMap(({ id, type, sets }) =>
          sets.map((set, position) => ({
            ...set,
            sessionExerciseId: id,
            exerciseType: type,
            position,
          })),
        ),
      );
      return existing ? 'replaced' : 'created';
    });
  }

  async findSession(userId: string, id: string): Promise<SessionRow | null> {
    const [row] = await this.db
      .select()
      .from(workoutSessions)
      .where(
        and(eq(workoutSessions.id, id), eq(workoutSessions.ownerId, userId)),
      )
      .limit(1);
    return row ?? null;
  }

  async listSessions(
    userId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: SessionRow[]; total: number }> {
    const rows = await this.db
      .select({
        ...getTableColumns(workoutSessions),
        total: sql<number>`count(*) over ()::int`,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.ownerId, userId))
      .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
      .limit(limit)
      .offset(offset);
    return { rows, total: rows[0]?.total ?? 0 };
  }

  async exercisesOf(
    sessionIds: readonly string[],
    locale: Locale,
  ): Promise<SessionExerciseRow[]> {
    if (sessionIds.length === 0) {
      return [];
    }
    const result = await this.db.execute(sql`
      select se.id, se.session_id, se.exercise_id, se.exercise_type as type,
             se.notes, se.rest_seconds, n.name, e.image_keys, (e.owner_id is not null) as custom
      from core.session_exercises se
      join core.exercises e on e.id = se.exercise_id
      join lateral ${bestTranslation(locale, sql`t.name`)} as n(name) on true
      where se.session_id in (${uuidList(sessionIds)})
      order by se.session_id, se.position`);
    return result.rows.map((row) => exerciseRowSchema.parse(row));
  }

  async setsOf(
    sessionExerciseIds: readonly string[],
  ): Promise<SessionSetRow[]> {
    if (sessionExerciseIds.length === 0) {
      return [];
    }
    return this.db
      .select({
        sessionExerciseId: sessionSets.sessionExerciseId,
        kind: sessionSets.kind,
        weightKg: sessionSets.weightKg,
        reps: sessionSets.reps,
        durationS: sessionSets.durationS,
        distanceM: sessionSets.distanceM,
        completedAt: sessionSets.completedAt,
      })
      .from(sessionSets)
      .where(inArray(sessionSets.sessionExerciseId, [...sessionExerciseIds]))
      .orderBy(sessionSets.sessionExerciseId, sessionSets.position);
  }

  async latestExercises(
    userId: string,
    exerciseIds: readonly string[],
  ): Promise<PreviousExerciseRow[]> {
    if (exerciseIds.length === 0) {
      return [];
    }
    const result = await this.db.execute(sql`
      select distinct on (se.exercise_id)
             se.id as session_exercise_id, se.exercise_id, se.rest_seconds,
             ws.id as workout_id, ws.started_at, ws.local_date
      from core.session_exercises se
      join core.workout_sessions ws on ws.id = se.session_id
      where ws.owner_id = ${userId} and se.exercise_id in (${uuidList(exerciseIds)})
      order by se.exercise_id, ws.started_at desc, ws.id desc, se.position desc`);
    return result.rows.map((row) => previousRowSchema.parse(row));
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const removed = await this.db
      .delete(workoutSessions)
      .where(
        and(eq(workoutSessions.id, id), eq(workoutSessions.ownerId, userId)),
      )
      .returning({ id: workoutSessions.id });
    return removed.length > 0;
  }

  private async ownedTemplateId(
    tx: Pick<Database, 'select'>,
    ownerId: string,
    templateId: string | null,
  ): Promise<string | null> {
    if (templateId === null) {
      return null;
    }
    const [owned] = await tx
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.ownerId, ownerId)))
      .limit(1);
    return owned?.id ?? null;
  }
}
