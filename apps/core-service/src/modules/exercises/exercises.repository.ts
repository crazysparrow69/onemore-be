import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../../db/database.constants';
import type { Database } from '../../db/database.module';
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
  type Equipment,
  type PrimaryMuscle,
} from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import { templateExercises } from '../../db/schema/templates';
import { sessionExercises } from '../../db/schema/workouts';
import type { ExerciseInput } from './exercise-input.schema';
import { TRANSLATE_FROM, TRANSLATE_TO } from './exercise-text';
import type { SearchPlan, SearchWord } from './exercise-search';

export const FALLBACK_LOCALE: Locale = 'en';

const UNDETERMINED_COLLATION = 'und-x-icu';

export type ExerciseSearch = {
  userId: string;
  locale: Locale;
  plan: SearchPlan;
  muscles: readonly PrimaryMuscle[];
  equipment: readonly Equipment[];
  mine: boolean;
  limit: number;
  offset: number;
};

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

const listRowSchema = z.object({
  ...baseRow,
  total: z.coerce.number().int(),
});

const detailsRowSchema = z.object({
  ...baseRow,
  category: z.enum(EXERCISE_CATEGORIES).nullable(),
  force: z.enum(EXERCISE_FORCES).nullable(),
  mechanic: z.enum(EXERCISE_MECHANICS).nullable(),
  level: z.enum(EXERCISE_LEVELS).nullable(),
  instructions: z.array(z.string()),
  type_locked: z.boolean(),
});

export type NewExercise = {
  id: string;
  userId: string;
  locale: Locale;
  input: ExerciseInput;
  limit: number;
};

export type UpdateResult = 'updated' | 'not_found' | 'type_locked';

export type ExerciseOwnership = {
  ownerId: string | null;
  archivedAt: Date | null;
};

export type ExerciseListRow = z.infer<typeof listRowSchema>;
export type ExerciseDetailsRow = z.infer<typeof detailsRowSchema>;

function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

function normalized(column: SQL): SQL {
  return sql`translate(lower(${column}), ${TRANSLATE_FROM}, ${TRANSLATE_TO})`;
}

export function bestTranslation(locale: Locale, columns: SQL): SQL {
  return sql`(
    select ${columns}
    from core.exercise_translations t
    where t.exercise_id = e.id
    order by (t.locale = ${locale}) desc, (t.locale = ${FALLBACK_LOCALE}) desc, t.locale
    limit 1
  )`;
}

function visibleTo(userId: string): SQL {
  return sql`(e.owner_id is null or e.owner_id = ${userId}) and e.archived_at is null`;
}

function every(conditions: SQL[]): SQL {
  return sql`(${sql.join(conditions, sql` and `)})`;
}

function wordInNames(word: SearchWord): SQL {
  return sql`d.names like any (${textArray(word.patterns)})`;
}

function wordInDocument(word: SearchWord): SQL {
  return sql`d.doc like any (${textArray(word.patterns)})`;
}

function wordInPrimaryTags(word: SearchWord): SQL {
  const parts: SQL[] = [];
  if (word.muscles.length > 0) {
    parts.push(sql`e.primary_muscles && ${textArray(word.muscles)}`);
  }
  if (word.equipment.length > 0) {
    parts.push(sql`e.equipment = any (${textArray(word.equipment)})`);
  }
  return parts.length === 0 ? sql`false` : sql`(${sql.join(parts, sql` or `)})`;
}

function wordInSecondaryTags(word: SearchWord): SQL {
  return word.muscles.length === 0
    ? sql`false`
    : sql`e.secondary_muscles && ${textArray(word.muscles)}`;
}

function wordInNamesOrPrimaryTags(word: SearchWord): SQL {
  return sql`(${wordInNames(word)} or ${wordInPrimaryTags(word)})`;
}

function wordInDocumentOrPrimaryTags(word: SearchWord): SQL {
  return sql`(${wordInDocument(word)} or ${wordInPrimaryTags(word)})`;
}

function wordAnywhere(word: SearchWord): SQL {
  return sql`(${wordInDocument(word)} or ${wordInPrimaryTags(word)} or ${wordInSecondaryTags(word)})`;
}

function rankOf(plan: SearchPlan): SQL {
  if (plan.words.length === 0) {
    return sql`0`;
  }
  const startsWithPhrase = sql`${normalized(sql`n.name`)} like ${`${plan.phrase}%`}`;
  return sql`case
    when ${startsWithPhrase} then 0
    when ${every(plan.words.map(wordInNamesOrPrimaryTags))} then 1
    when ${every(plan.words.map(wordInDocumentOrPrimaryTags))} then 2
    else 3
  end`;
}

function tagHitsOf(plan: SearchPlan): SQL {
  const hits = plan.words
    .filter((word) => word.muscles.length > 0 || word.equipment.length > 0)
    .map(
      (word) => sql`(case when ${wordInPrimaryTags(word)} then 1 else 0 end)`,
    );
  return hits.length === 0 ? sql`0` : sql`(${sql.join(hits, sql` + `)})`;
}

function filtersOf(search: ExerciseSearch): SQL {
  const conditions: SQL[] = [];
  if (search.mine) {
    conditions.push(sql`e.owner_id = ${search.userId}`);
  }
  if (search.muscles.length > 0) {
    conditions.push(sql`e.primary_muscles && ${textArray(search.muscles)}`);
  }
  if (search.equipment.length > 0) {
    conditions.push(sql`e.equipment = any (${textArray(search.equipment)})`);
  }
  if (search.plan.words.length > 0) {
    conditions.push(every(search.plan.words.map(wordAnywhere)));
  }
  return conditions.length === 0
    ? sql``
    : sql`and ${sql.join(conditions, sql` and `)}`;
}

function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && current.code === '23503') {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

@Injectable()
export class ExercisesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  private readonly collations = new Map<Locale, Promise<SQL>>();

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
             e.equipment, e.image_keys, (e.owner_id is not null) as custom,
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

  async findById(
    userId: string,
    locale: Locale,
    id: string,
  ): Promise<ExerciseDetailsRow | null> {
    const query = sql`
      select e.id, n.name, n.instructions, e.type, e.primary_muscles,
             e.secondary_muscles, e.equipment, e.image_keys,
             (e.owner_id is not null) as custom, e.category,
             e.force, e.mechanic, e.level,
             (exists (select 1 from core.session_exercises se where se.exercise_id = e.id) or exists (select 1 from core.template_exercises te where te.exercise_id = e.id)) as type_locked
      from core.exercises e
      join lateral ${bestTranslation(locale, sql`t.name, t.instructions`)} as n(name, instructions) on true
      where e.id = ${id} and ${visibleTo(userId)}`;
    const result = await this.db.execute(query);
    const [row] = result.rows;
    return row === undefined ? null : detailsRowSchema.parse(row);
  }

  async create(exercise: NewExercise): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`custom-exercises:${exercise.userId}`}, 0))`,
      );
      const [counted] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(exercises)
        .where(
          and(
            eq(exercises.ownerId, exercise.userId),
            isNull(exercises.archivedAt),
          ),
        );
      if ((counted?.total ?? 0) >= exercise.limit) {
        return false;
      }
      const { input } = exercise;
      await tx.insert(exercises).values({
        id: exercise.id,
        ownerId: exercise.userId,
        source: 'user',
        visibility: 'private',
        type: input.type,
        primaryMuscles: input.primaryMuscles,
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment,
      });
      await tx.insert(exerciseTranslations).values({
        exerciseId: exercise.id,
        locale: exercise.locale,
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
  ): Promise<UpdateResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select({ type: exercises.type })
          .from(exercises)
          .where(
            and(
              eq(exercises.id, id),
              eq(exercises.ownerId, userId),
              isNull(exercises.archivedAt),
            ),
          )
          .for('update');
        if (!current) {
          return 'not_found';
        }
        if (current.type !== input.type) {
          const [used] = await tx
            .select({ id: sessionExercises.id })
            .from(sessionExercises)
            .where(eq(sessionExercises.exerciseId, id))
            .limit(1);
          const [planned] = await tx
            .select({ id: templateExercises.id })
            .from(templateExercises)
            .where(eq(templateExercises.exerciseId, id))
            .limit(1);
          if (used || planned) {
            return 'type_locked';
          }
        }
        await tx
          .update(exercises)
          .set({
            type: input.type,
            primaryMuscles: input.primaryMuscles,
            secondaryMuscles: input.secondaryMuscles,
            equipment: input.equipment,
            updatedAt: new Date(),
          })
          .where(eq(exercises.id, id));
        await tx
          .update(exerciseTranslations)
          .set({ name: input.name, instructions: input.instructions })
          .where(eq(exerciseTranslations.exerciseId, id));
        return 'updated';
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'type_locked';
      }
      throw error;
    }
  }

  async archive(id: string, userId: string): Promise<boolean> {
    const archived = await this.db
      .update(exercises)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(exercises.id, id),
          eq(exercises.ownerId, userId),
          isNull(exercises.archivedAt),
        ),
      )
      .returning({ id: exercises.id });
    return archived.length > 0;
  }
}
