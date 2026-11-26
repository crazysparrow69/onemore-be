import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/database.module';
import { exercises, type ExerciseType } from '../../db/schema/exercises';
import { FALLBACK_LOCALE, type Locale } from '../../db/schema/locales';

type Reader = Pick<Database, 'select'>;

export function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

export function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
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

export function imageKeysOf(): SQL {
  return sql`case
    when e.photo_id is null then e.image_keys
    else array[(select m.storage_key from core.media_assets m where m.id = e.photo_id)]
  end`;
}

export function visibleTo(userId: string): SQL {
  return sql`(e.owner_id is null or e.owner_id = ${userId}) and e.archived_at is null`;
}

export function typeLockedOf(exerciseId: SQL): SQL {
  return sql`(
    exists (select 1 from core.session_exercises se where se.exercise_id = ${exerciseId})
    or exists (select 1 from core.template_exercises te where te.exercise_id = ${exerciseId})
  )`;
}

export async function typesVisibleTo(
  db: Reader,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, ExerciseType>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: exercises.id, type: exercises.type })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, [...ids]),
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
      ),
    );
  return new Map(rows.map((row) => [row.id, row.type]));
}

export async function lockTypes(
  tx: Reader,
  ids: readonly string[],
): Promise<Map<string, ExerciseType>> {
  const rows = await tx
    .select({ id: exercises.id, type: exercises.type })
    .from(exercises)
    .where(inArray(exercises.id, [...ids]))
    .for('share');
  return new Map(rows.map((row) => [row.id, row.type]));
}
