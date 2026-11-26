import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { EXERCISE_TYPES, exercises } from '../../db/schema/exercises';
import type { ExerciseType } from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import {
  templateExercises,
  templateSets,
  templates,
} from '../../db/schema/templates';
import type { SetKind } from '../../db/schema/workouts';
import { bestTranslation } from '../exercises/exercises.repository';

export type NewTemplateSet = {
  id: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type NewTemplateExercise = {
  id: string;
  exerciseId: string;
  type: ExerciseType;
  notes: string | null;
  restSeconds: number | null;
  sets: NewTemplateSet[];
};

export type NewTemplate = {
  id: string;
  ownerId: string;
  name: string;
  notes: string | null;
  limit: number;
  exercises: NewTemplateExercise[];
};

export type SaveResult =
  'created' | 'replaced' | 'not_found' | 'stale' | 'limit';

export type TemplateRow = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastPerformedAt: Date | null;
};

export type TemplateExerciseRow = {
  id: string;
  templateId: string;
  exerciseId: string;
  type: ExerciseType;
  notes: string | null;
  restSeconds: number | null;
  name: string;
  image: string | null;
  custom: boolean;
  archived: boolean;
};

export type TemplateSetRow = {
  templateExerciseId: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

const exerciseRowSchema = z.object({
  id: z.uuid(),
  template_id: z.uuid(),
  exercise_id: z.uuid(),
  type: z.enum(EXERCISE_TYPES),
  notes: z.string().nullable(),
  rest_seconds: z.number().int().nullable(),
  name: z.string(),
  image_keys: z.array(z.string()),
  custom: z.boolean(),
  archived: z.boolean(),
});

const templateRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  last_performed_at: z.coerce.date().nullable(),
});

@Injectable()
export class TemplatesRepository {
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

  async save(template: NewTemplate): Promise<SaveResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`templates:${template.ownerId}`}, 0))`,
      );
      const exerciseIds = [
        ...new Set(template.exercises.map((item) => item.exerciseId)),
      ];
      const current = await tx
        .select({ id: exercises.id, type: exercises.type })
        .from(exercises)
        .where(inArray(exercises.id, exerciseIds))
        .for('share');
      const types = new Map(current.map((row) => [row.id, row.type]));
      if (
        template.exercises.some(
          (item) => types.get(item.exerciseId) !== item.type,
        )
      ) {
        return 'stale';
      }

      const [existing] = await tx
        .select({
          ownerId: templates.ownerId,
          archivedAt: templates.archivedAt,
        })
        .from(templates)
        .where(eq(templates.id, template.id))
        .limit(1);
      if (
        existing &&
        (existing.ownerId !== template.ownerId || existing.archivedAt !== null)
      ) {
        return 'not_found';
      }

      if (existing) {
        await tx
          .update(templates)
          .set({
            name: template.name,
            notes: template.notes,
            updatedAt: new Date(),
          })
          .where(eq(templates.id, template.id));
        await tx
          .delete(templateExercises)
          .where(eq(templateExercises.templateId, template.id));
      } else {
        const [counted] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(templates)
          .where(
            and(
              eq(templates.ownerId, template.ownerId),
              isNull(templates.archivedAt),
            ),
          );
        if ((counted?.total ?? 0) >= template.limit) {
          return 'limit';
        }
        await tx.insert(templates).values({
          id: template.id,
          ownerId: template.ownerId,
          name: template.name,
          notes: template.notes,
        });
      }

      await tx.insert(templateExercises).values(
        template.exercises.map((item, position) => ({
          id: item.id,
          templateId: template.id,
          exerciseId: item.exerciseId,
          exerciseType: item.type,
          position,
          notes: item.notes,
          restSeconds: item.restSeconds,
        })),
      );
      await tx.insert(templateSets).values(
        template.exercises.flatMap((item) =>
          item.sets.map((set, position) => ({
            id: set.id,
            templateExerciseId: item.id,
            exerciseType: item.type,
            position,
            kind: set.kind,
            weightKg: set.weightKg,
            reps: set.reps,
            durationS: set.durationS,
            distanceM: set.distanceM,
          })),
        ),
      );
      return existing ? 'replaced' : 'created';
    });
  }

  async list(userId: string): Promise<TemplateRow[]> {
    const result = await this.db.execute(sql`
      select t.id, t.name, t.notes, t.created_at, t.updated_at,
             (select max(ws.started_at) from core.workout_sessions ws where ws.template_id = t.id) as last_performed_at
      from core.templates t
      where t.owner_id = ${userId} and t.archived_at is null
      order by t.created_at, t.id`);
    return result.rows.map((raw) =>
      toTemplateRow(templateRowSchema.parse(raw)),
    );
  }

  async find(userId: string, id: string): Promise<TemplateRow | null> {
    const result = await this.db.execute(sql`
      select t.id, t.name, t.notes, t.created_at, t.updated_at,
             (select max(ws.started_at) from core.workout_sessions ws where ws.template_id = t.id) as last_performed_at
      from core.templates t
      where t.id = ${id} and t.owner_id = ${userId} and t.archived_at is null`);
    const [row] = result.rows;
    return row === undefined
      ? null
      : toTemplateRow(templateRowSchema.parse(row));
  }

  async exercisesOf(
    templateIds: readonly string[],
    locale: Locale,
  ): Promise<TemplateExerciseRow[]> {
    if (templateIds.length === 0) {
      return [];
    }
    const ids = sql.join(
      templateIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const result = await this.db.execute(sql`
      select te.id, te.template_id, te.exercise_id, te.exercise_type as type,
             te.notes, te.rest_seconds, n.name, e.image_keys,
             (e.owner_id is not null) as custom, (e.archived_at is not null) as archived
      from core.template_exercises te
      join core.exercises e on e.id = te.exercise_id
      join lateral ${bestTranslation(locale, sql`t.name`)} as n(name) on true
      where te.template_id in (${ids})
      order by te.template_id, te.position`);
    return result.rows.map((raw) => {
      const row = exerciseRowSchema.parse(raw);
      return {
        id: row.id,
        templateId: row.template_id,
        exerciseId: row.exercise_id,
        type: row.type,
        notes: row.notes,
        restSeconds: row.rest_seconds,
        name: row.name,
        image: row.image_keys[0] ?? null,
        custom: row.custom,
        archived: row.archived,
      };
    });
  }

  async setsOf(
    templateExerciseIds: readonly string[],
  ): Promise<TemplateSetRow[]> {
    if (templateExerciseIds.length === 0) {
      return [];
    }
    return this.db
      .select({
        templateExerciseId: templateSets.templateExerciseId,
        kind: templateSets.kind,
        weightKg: templateSets.weightKg,
        reps: templateSets.reps,
        durationS: templateSets.durationS,
        distanceM: templateSets.distanceM,
      })
      .from(templateSets)
      .where(inArray(templateSets.templateExerciseId, [...templateExerciseIds]))
      .orderBy(
        asc(templateSets.templateExerciseId),
        asc(templateSets.position),
      );
  }

  async archive(userId: string, id: string): Promise<boolean> {
    const archived = await this.db
      .update(templates)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(templates.id, id),
          eq(templates.ownerId, userId),
          isNull(templates.archivedAt),
        ),
      )
      .returning({ id: templates.id });
    return archived.length > 0;
  }
}

function toTemplateRow(row: z.infer<typeof templateRowSchema>): TemplateRow {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastPerformedAt: row.last_performed_at,
  };
}
