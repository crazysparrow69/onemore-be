import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { exercises, exerciseTranslations } from '../../db/schema';
import { withSeedTransaction } from '../seed-transaction';
import type { TranslationRow } from './load-translations';

const TRANSLATIONS_LOCK_KEY = 7_251_003;
const BATCH_SIZE = 200;

export type TranslationSummary = {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

export async function runTranslationSeed(
  connectionString: string,
  rows: TranslationRow[],
): Promise<TranslationSummary> {
  return withSeedTransaction(connectionString, TRANSLATIONS_LOCK_KEY, (db) =>
    importTranslations(db, rows),
  );
}

export async function importTranslations(
  db: NodePgDatabase,
  rows: TranslationRow[],
): Promise<TranslationSummary> {
  const inserted = new Set<string>();
  const changed = new Set<string>();

  for (const batch of chunks(rows, BATCH_SIZE)) {
    const full = batch.filter((row) => row.name !== null);
    if (full.length > 0) {
      for (const result of await upsertFull(db, full)) {
        (result.inserted ? inserted : changed).add(key(result));
      }
    }
    const aliasesOnly = batch.filter((row) => row.name === null);
    if (aliasesOnly.length > 0) {
      for (const result of await updateAliases(db, aliasesOnly)) {
        changed.add(key(result));
      }
    }
  }

  const touchedIds = [...changed].map((value) => value.split('/')[0]);
  if (touchedIds.length > 0) {
    await db.execute(
      sql`update ${exercises} set updated_at = now() where id in (${sql.join(
        touchedIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }

  return {
    total: rows.length,
    inserted: inserted.size,
    updated: changed.size,
    unchanged: rows.length - inserted.size - changed.size,
  };
}

type Touched = { exerciseId: string; locale: string; inserted: boolean };

function key(row: { exerciseId: string; locale: string }): string {
  return `${row.exerciseId}/${row.locale}`;
}

async function upsertFull(
  db: NodePgDatabase,
  batch: TranslationRow[],
): Promise<Touched[]> {
  return db
    .insert(exerciseTranslations)
    .values(
      batch.map((row) => ({
        exerciseId: row.exerciseId,
        locale: row.locale,
        name: row.name as string,
        instructions: row.instructions as string[],
        aliases: row.aliases,
      })),
    )
    .onConflictDoUpdate({
      target: [exerciseTranslations.exerciseId, exerciseTranslations.locale],
      set: {
        name: sql`excluded.name`,
        instructions: sql`excluded.instructions`,
        aliases: sql`excluded.aliases`,
      },
      setWhere: sql`(${exerciseTranslations.name}, ${exerciseTranslations.instructions}, ${exerciseTranslations.aliases})
        is distinct from
        (excluded.name, excluded.instructions, excluded.aliases)`,
    })
    .returning({
      exerciseId: exerciseTranslations.exerciseId,
      locale: exerciseTranslations.locale,
      inserted: sql<boolean>`(xmax = 0)`,
    });
}

async function updateAliases(
  db: NodePgDatabase,
  batch: TranslationRow[],
): Promise<Touched[]> {
  const touched: Touched[] = [];
  for (const row of batch) {
    const updated = await db.execute<{ exercise_id: string; locale: string }>(
      sql`update ${exerciseTranslations}
          set aliases = ${textArray(row.aliases)}
          where exercise_id = ${row.exerciseId}::uuid
            and locale = ${row.locale}
            and aliases is distinct from ${textArray(row.aliases)}
          returning exercise_id, locale`,
    );
    if (updated.rowCount === 0) {
      const exists = await db.execute(
        sql`select 1 from ${exerciseTranslations}
            where exercise_id = ${row.exerciseId}::uuid and locale = ${row.locale}`,
      );
      if (exists.rowCount === 0) {
        throw new Error(
          `No ${row.locale} row for exercise ${row.exerciseId}: run the exercise seed first`,
        );
      }
    }
    for (const result of updated.rows) {
      touched.push({
        exerciseId: result.exercise_id,
        locale: result.locale,
        inserted: false,
      });
    }
  }
  return touched;
}

function textArray(values: string[]) {
  return sql`array(select jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
