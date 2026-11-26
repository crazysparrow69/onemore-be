import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { EXERCISE_TYPES, exercises } from '../../db/schema/exercises';
import type { ExerciseType } from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import {
  sessionExercises,
  sessionSets,
  workoutSessions,
  type SetKind,
} from '../../db/schema/workouts';
import { bestTranslation } from '../exercises/exercises.repository';

export type NewWorkoutSet = {
  id: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  completedAt: Date;
};

export type NewWorkoutExercise = {
  id: string;
  exerciseId: string;
  type: ExerciseType;
  notes: string | null;
  sets: NewWorkoutSet[];
};

export type NewWorkout = {
  id: string;
  ownerId: string;
  name: string;
  notes: string | null;
  startedAt: Date;
  endedAt: Date;
  localDate: string;
  timeZone: string;
  exercises: NewWorkoutExercise[];
};

export type SaveResult = 'created' | 'replaced' | 'foreign' | 'stale';

export type SessionRow = {
  id: string;
  name: string;
  notes: string | null;
  startedAt: Date;
  endedAt: Date;
  localDate: string;
  timeZone: string;
};

export type SessionExerciseRow = {
  id: string;
  sessionId: string;
  exerciseId: string;
  type: ExerciseType;
  notes: string | null;
  name: string;
  image: string | null;
  custom: boolean;
};

export type SessionSetRow = {
  sessionExerciseId: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  completedAt: Date | null;
};

const exerciseRowSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  exercise_id: z.uuid(),
  type: z.enum(EXERCISE_TYPES),
  notes: z.string().nullable(),
  name: z.string(),
  image_keys: z.array(z.string()),
  custom: z.boolean(),
});

const sessionColumns = {
  id: workoutSessions.id,
  name: workoutSessions.name,
  notes: workoutSessions.notes,
  startedAt: workoutSessions.startedAt,
  endedAt: workoutSessions.endedAt,
  localDate: workoutSessions.localDate,
  timeZone: workoutSessions.timeZone,
};

@Injectable()
export class WorkoutsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async exerciseTypes(
    userId: string,
    ids: readonly string[],
  ): Promise<Map<string, ExerciseType>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ id: exercises.id, type: exercises.type })
      .from(exercises)
      .where(
        and(
          inArray(exercises.id, [...ids]),
          sql`(${exercises.ownerId} is null or ${exercises.ownerId} = ${userId})`,
        ),
      );
    return new Map(rows.map((row) => [row.id, row.type]));
  }

  async save(workout: NewWorkout): Promise<SaveResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`workout:${workout.id}`}, 0))`,
      );
      const exerciseIds = [
        ...new Set(workout.exercises.map((item) => item.exerciseId)),
      ];
      const current = await tx
        .select({ id: exercises.id, type: exercises.type })
        .from(exercises)
        .where(inArray(exercises.id, exerciseIds))
        .for('share');
      const types = new Map(current.map((row) => [row.id, row.type]));
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

      const values = {
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
          .set({ ...values, updatedAt: new Date() })
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
        })),
      );
      await tx.insert(sessionSets).values(
        workout.exercises.flatMap((item) =>
          item.sets.map((set, position) => ({
            id: set.id,
            sessionExerciseId: item.id,
            exerciseType: item.type,
            position,
            kind: set.kind,
            weightKg: set.weightKg,
            reps: set.reps,
            durationS: set.durationS,
            distanceM: set.distanceM,
            completedAt: set.completedAt,
          })),
        ),
      );
      return existing ? 'replaced' : 'created';
    });
  }

  async findSession(userId: string, id: string): Promise<SessionRow | null> {
    const [row] = await this.db
      .select(sessionColumns)
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
      .select({ ...sessionColumns, total: sql<number>`count(*) over ()::int` })
      .from(workoutSessions)
      .where(eq(workoutSessions.ownerId, userId))
      .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
      .limit(limit)
      .offset(offset);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        notes: row.notes,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        localDate: row.localDate,
        timeZone: row.timeZone,
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async exercisesOf(
    sessionIds: readonly string[],
    locale: Locale,
  ): Promise<SessionExerciseRow[]> {
    if (sessionIds.length === 0) {
      return [];
    }
    const ids = sql.join(
      sessionIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const result = await this.db.execute(sql`
      select se.id, se.session_id, se.exercise_id, se.exercise_type as type,
             se.notes, n.name, e.image_keys, (e.owner_id is not null) as custom
      from core.session_exercises se
      join core.exercises e on e.id = se.exercise_id
      join lateral ${bestTranslation(locale, sql`t.name`)} as n(name) on true
      where se.session_id in (${ids})
      order by se.session_id, se.position`);
    return result.rows.map((raw) => {
      const row = exerciseRowSchema.parse(raw);
      return {
        id: row.id,
        sessionId: row.session_id,
        exerciseId: row.exercise_id,
        type: row.type,
        notes: row.notes,
        name: row.name,
        image: row.image_keys[0] ?? null,
        custom: row.custom,
      };
    });
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

  async remove(userId: string, id: string): Promise<boolean> {
    const removed = await this.db
      .delete(workoutSessions)
      .where(
        and(eq(workoutSessions.id, id), eq(workoutSessions.ownerId, userId)),
      )
      .returning({ id: workoutSessions.id });
    return removed.length > 0;
  }
}
