import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { camelizeKeys } from '../../common/camelize';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { lockXact } from '../../db/locks';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import {
  templateExercises,
  templateSets,
  templates,
} from '../../db/schema/templates';
import {
  bestTranslation,
  lockTypes,
  uuidList,
} from '../exercises/exercise-sql';
import type { PlannedExercise } from '../exercises/prepare-exercises';

export type NewTemplateExercise = PlannedExercise;

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

export type TemplateSetRow = Pick<
  typeof templateSets.$inferSelect,
  | 'templateExerciseId'
  | 'kind'
  | 'weightKg'
  | 'reps'
  | 'durationS'
  | 'distanceM'
>;

const exerciseRowSchema = z
  .object({
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
  })
  .transform(camelizeKeys);

const templateRowSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    notes: z.string().nullable(),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
    last_performed_at: z.coerce.date().nullable(),
  })
  .transform(camelizeKeys);

export type TemplateRow = z.output<typeof templateRowSchema>;
export type TemplateExerciseRow = z.output<typeof exerciseRowSchema>;

@Injectable()
export class TemplatesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async save(template: NewTemplate): Promise<SaveResult> {
    return this.db.transaction(async (tx) => {
      await lockXact(tx, `templates:${template.ownerId}`);

      const types = await lockTypes(
        tx,
        template.exercises.map((item) => item.exerciseId),
      );
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

      const { id, ownerId, name, notes } = template;
      if (existing) {
        await tx
          .update(templates)
          .set({ name, notes })
          .where(eq(templates.id, id));
        await tx
          .delete(templateExercises)
          .where(eq(templateExercises.templateId, id));
      } else {
        const [counted] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(templates)
          .where(
            and(eq(templates.ownerId, ownerId), isNull(templates.archivedAt)),
          );
        if ((counted?.total ?? 0) >= template.limit) {
          return 'limit';
        }
        await tx.insert(templates).values({ id, ownerId, name, notes });
      }

      await tx.insert(templateExercises).values(
        template.exercises.map((item, position) => ({
          id: item.id,
          templateId: id,
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
            ...set,
            templateExerciseId: item.id,
            exerciseType: item.type,
            position,
          })),
        ),
      );
      return existing ? 'replaced' : 'created';
    });
  }

  list(userId: string): Promise<TemplateRow[]> {
    return this.query(sql`t.owner_id = ${userId}`);
  }

  async find(userId: string, id: string): Promise<TemplateRow | null> {
    const [row] = await this.query(
      sql`t.id = ${id} and t.owner_id = ${userId}`,
    );
    return row ?? null;
  }

  async exercisesOf(
    templateIds: readonly string[],
    locale: Locale,
  ): Promise<TemplateExerciseRow[]> {
    if (templateIds.length === 0) {
      return [];
    }
    const result = await this.db.execute(sql`
      select te.id, te.template_id, te.exercise_id, te.exercise_type as type,
             te.notes, te.rest_seconds, n.name, e.image_keys,
             (e.owner_id is not null) as custom, (e.archived_at is not null) as archived
      from core.template_exercises te
      join core.exercises e on e.id = te.exercise_id
      join lateral ${bestTranslation(locale, sql`t.name`)} as n(name) on true
      where te.template_id in (${uuidList(templateIds)})
      order by te.template_id, te.position`);
    return result.rows.map((row) => exerciseRowSchema.parse(row));
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
      .set({ archivedAt: new Date() })
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

  private async query(condition: SQL): Promise<TemplateRow[]> {
    const result = await this.db.execute(sql`
      select t.id, t.name, t.notes, t.created_at, t.updated_at,
             (select max(ws.started_at) from core.workout_sessions ws where ws.template_id = t.id) as last_performed_at
      from core.templates t
      where ${condition} and t.archived_at is null
      order by t.created_at, t.id`);
    return result.rows.map((row) => templateRowSchema.parse(row));
  }
}
