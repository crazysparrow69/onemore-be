import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { camelizeKeys } from '../../common/camelize';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
import { lockXact } from '../../db/locks';
import { PG_FOREIGN_KEY_VIOLATION, pgErrorOf } from '../../db/pg-error';
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  EXERCISE_TYPES,
  exercises,
  exerciseTranslations,
  MUSCLES,
  PRIMARY_MUSCLES,
} from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import type { ExerciseInput } from './exercise-input.schema';
import {
  filtersOf,
  normalized,
  rankOf,
  tagHitsOf,
  type ExerciseSearch,
} from './exercise-search.sql';
import {
  bestTranslation,
  textArray,
  imageKeysOf,
  typeLockedOf,
  typesVisibleTo,
  visibleTo,
} from './exercise-sql';

const UNDETERMINED_COLLATION = 'und-x-icu';

const baseRow = {
  id: z.uuid(),
  name: z.string(),
  type: z.enum(EXERCISE_TYPES),
  primary_muscles: z.array(z.enum(PRIMARY_MUSCLES)),
  secondary_muscles: z.array(z.enum(MUSCLES)),
  equipment: z.enum(EQUIPMENT),
  image_keys: z.array(z.string()),
  custom: z.boolean(),
};

const listRowSchema = z
  .object({
    ...baseRow,
    total: z.coerce.number().int(),
  })
  .transform(camelizeKeys);

const detailsRowSchema = z
  .object({
    ...baseRow,
    category: z.enum(EXERCISE_CATEGORIES).nullable(),
    force: z.enum(EXERCISE_FORCES).nullable(),
    mechanic: z.enum(EXERCISE_MECHANICS).nullable(),
    level: z.enum(EXERCISE_LEVELS).nullable(),
    instructions: z.array(z.string()),
    photo_id: z.uuid().nullable(),
    type_locked: z.boolean(),
  })
  .transform(camelizeKeys);

export type NewExercise = {
  id: string;
  userId: string;
  locale: Locale;
  input: ExerciseInput;
  limit: number;
};

export type UpdateResult = 'updated' | 'not_found' | 'type_locked';

export type UpdateOutcome = {
  result: UpdateResult;
  replacedPhotoId: string | null;
};

export type ExerciseOwnership = Pick<
  typeof exercises.$inferSelect,
  'ownerId' | 'archivedAt' | 'photoId'
>;

export type ExerciseListRow = z.infer<typeof listRowSchema>;
export type ExerciseDetailsRow = z.infer<typeof detailsRowSchema>;

function ownActive(id: string, userId: string): SQL | undefined {
  return and(
    eq(exercises.id, id),
    eq(exercises.ownerId, userId),
    isNull(exercises.archivedAt),
  );
}

@Injectable()
export class ExercisesRepository {
  private readonly collations = new Map<Locale, Promise<SQL>>();

  constructor(@Inject(DB) private readonly db: Database) {}

  private collationOf(locale: Locale): Promise<SQL> {
    const cached = this.collations.get(locale);
    if (cached) {
      return cached;
    }
    const resolved = this.resolveCollation(locale);
    this.collations.set(locale, resolved);
    return resolved;
  }

  private async resolveCollation(locale: Locale): Promise<SQL> {
    const candidates = [`${locale}-x-icu`, UNDETERMINED_COLLATION];
    const result = await this.db.execute(
      sql`select collname from pg_catalog.pg_collation where collname = any (${textArray(candidates)})`,
    );
    const available = new Set(result.rows.map((row) => row.collname));
    const chosen = candidates.find((name) => available.has(name));
    return chosen === undefined
      ? sql``
      : sql`collate ${sql.identifier(chosen)}`;
  }

  async search(search: ExerciseSearch): Promise<ExerciseListRow[]> {
    const collation = await this.collationOf(search.locale);
    const query = sql`
      select e.id, n.name, e.type, e.primary_muscles, e.secondary_muscles,
             e.equipment, ${imageKeysOf()} as image_keys, (e.owner_id is not null) as custom,
             ${rankOf(search.plan)} as rank,
             ${tagHitsOf(search.plan)} as tag_hits,
             count(*) over () as total
      from core.exercises e
      join lateral ${bestTranslation(search.locale, sql`t.name`)} as n(name) on true
      join lateral (
        select
          ' ' || string_agg(${normalized(sql`t.name`)}, ' ') as names,
          ' ' || string_agg(
            ${normalized(sql`t.name || ' ' || array_to_string(t.aliases, ' ')`)},
            ' '
          ) as doc
        from core.exercise_translations t
        where t.exercise_id = e.id
      ) d on true
      where ${visibleTo(search.userId)}
      ${filtersOf(search)}
      order by rank, tag_hits desc, n.name ${collation}, e.id
      limit ${search.limit} offset ${search.offset}`;
    const result = await this.db.execute(query);
    return result.rows.map((row) => listRowSchema.parse(row));
  }

  typesVisibleTo(userId: string, ids: readonly string[]) {
    return typesVisibleTo(this.db, userId, ids);
  }

  async findById(
    userId: string,
    locale: Locale,
    id: string,
  ): Promise<ExerciseDetailsRow | null> {
    const query = sql`
      select e.id, n.name, n.instructions, e.type, e.primary_muscles,
             e.secondary_muscles, e.equipment, ${imageKeysOf()} as image_keys,
             e.photo_id, (e.owner_id is not null) as custom, e.category,
             e.force, e.mechanic, e.level,
             ${typeLockedOf(sql`e.id`)} as type_locked
      from core.exercises e
      join lateral ${bestTranslation(locale, sql`t.name, t.instructions`)} as n(name, instructions) on true
      where e.id = ${id} and ${visibleTo(userId)}`;
    const result = await this.db.execute(query);
    const [row] = result.rows;
    return row === undefined ? null : detailsRowSchema.parse(row);
  }

  async create(exercise: NewExercise): Promise<boolean> {
    const { id, userId, locale, input } = exercise;
    return this.db.transaction(async (tx) => {
      await lockXact(tx, `custom-exercises:${userId}`);
      const [counted] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(exercises)
        .where(
          and(eq(exercises.ownerId, userId), isNull(exercises.archivedAt)),
        );
      if ((counted?.total ?? 0) >= exercise.limit) {
        return false;
      }
      await tx.insert(exercises).values({
        id,
        ownerId: userId,
        source: 'user',
        visibility: 'private',
        type: input.type,
        primaryMuscles: input.primaryMuscles,
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment,
        photoId: input.photoId,
      });
      await tx.insert(exerciseTranslations).values({
        exerciseId: id,
        locale,
        name: input.name,
        instructions: input.instructions,
        aliases: [],
      });
      return true;
    });
  }

  async findOwnership(id: string): Promise<ExerciseOwnership | null> {
    const [row] = await this.db
      .select({
        ownerId: exercises.ownerId,
        archivedAt: exercises.archivedAt,
        photoId: exercises.photoId,
      })
      .from(exercises)
      .where(eq(exercises.id, id))
      .limit(1);
    return row ?? null;
  }

  async update(
    id: string,
    userId: string,
    input: ExerciseInput,
  ): Promise<UpdateOutcome> {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select({ type: exercises.type, photoId: exercises.photoId })
          .from(exercises)
          .where(ownActive(id, userId))
          .for('update');
        if (!current) {
          return { result: 'not_found', replacedPhotoId: null };
        }
        if (current.type !== input.type) {
          const locked = await tx.execute(
            sql`select ${typeLockedOf(sql`${id}::uuid`)} as locked`,
          );
          if (locked.rows[0]?.locked === true) {
            return { result: 'type_locked', replacedPhotoId: null };
          }
        }
        await tx
          .update(exercises)
          .set({
            type: input.type,
            primaryMuscles: input.primaryMuscles,
            secondaryMuscles: input.secondaryMuscles,
            equipment: input.equipment,
            photoId: input.photoId,
          })
          .where(eq(exercises.id, id));
        await tx
          .update(exerciseTranslations)
          .set({ name: input.name, instructions: input.instructions })
          .where(eq(exerciseTranslations.exerciseId, id));
        return {
          result: 'updated',
          replacedPhotoId:
            current.photoId !== input.photoId ? current.photoId : null,
        };
      });
    } catch (error) {
      if (pgErrorOf(error)?.code === PG_FOREIGN_KEY_VIOLATION) {
        return { result: 'type_locked', replacedPhotoId: null };
      }
      throw error;
    }
  }

  async archive(id: string, userId: string): Promise<boolean> {
    const archived = await this.db
      .update(exercises)
      .set({ archivedAt: new Date() })
      .where(ownActive(id, userId))
      .returning({ id: exercises.id });
    return archived.length > 0;
  }
}
