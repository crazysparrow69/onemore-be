import { inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { exercises, exerciseTranslations } from '../../db/schema';
import { withSeedTransaction } from '../seed-transaction';
import type { SeedExercise } from './map-exercise';

const SEED_LOCK_KEY = 7_251_002;
const BATCH_SIZE = 200;

export type SeedSummary = {
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

type Db = NodePgDatabase;

export async function runExerciseSeed(
  connectionString: string,
  seed: SeedExercise[],
): Promise<SeedSummary> {
  return withSeedTransaction(connectionString, SEED_LOCK_KEY, (db) =>
    importExercises(db, seed),
  );
}

export async function importExercises(
  db: Db,
  seed: SeedExercise[],
): Promise<SeedSummary> {
  const inserted = new Set<string>();
  const changed = new Set<string>();

  for (const batch of chunks(seed, BATCH_SIZE)) {
    const rows = await upsertExercises(db, batch);
    for (const row of rows) {
      (row.inserted ? inserted : changed).add(row.id);
    }
    const translated = await upsertTranslations(db, batch);
    const touched = translated.filter(
      (id) => !inserted.has(id) && !changed.has(id),
    );
    if (touched.length > 0) {
      await db
        .update(exercises)
        .set({ updatedAt: sql`now()` })
        .where(inArray(exercises.id, touched));
    }
    for (const id of touched) {
      changed.add(id);
    }
  }

  return {
    total: seed.length,
    inserted: inserted.size,
    updated: changed.size,
    unchanged: seed.length - inserted.size - changed.size,
  };
}

async function upsertExercises(
  db: Db,
  batch: SeedExercise[],
): Promise<{ id: string; inserted: boolean }[]> {
  return db
    .insert(exercises)
    .values(
      batch.map((exercise) => ({
        id: exercise.id,
        ownerId: null,
        source: exercise.source,
        sourceId: exercise.sourceId,
        visibility: 'public' as const,
        type: exercise.type,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        category: exercise.category,
        force: exercise.force,
        mechanic: exercise.mechanic,
        level: exercise.level,
        imageKeys: exercise.imageKeys,
      })),
    )
    .onConflictDoUpdate({
      target: [exercises.source, exercises.sourceId],
      set: {
        type: sql`excluded.type`,
        primaryMuscles: sql`excluded.primary_muscles`,
        secondaryMuscles: sql`excluded.secondary_muscles`,
        equipment: sql`excluded.equipment`,
        category: sql`excluded.category`,
        force: sql`excluded.force`,
        mechanic: sql`excluded.mechanic`,
        level: sql`excluded.level`,
        imageKeys: sql`excluded.image_keys`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`(${exercises.type}, ${exercises.primaryMuscles}, ${exercises.secondaryMuscles}, ${exercises.equipment}, ${exercises.category}, ${exercises.force}, ${exercises.mechanic}, ${exercises.level}, ${exercises.imageKeys})
        is distinct from
        (excluded.type, excluded.primary_muscles, excluded.secondary_muscles, excluded.equipment, excluded.category, excluded.force, excluded.mechanic, excluded.level, excluded.image_keys)`,
    })
    .returning({
      id: exercises.id,
      inserted: sql<boolean>`(xmax = 0)`,
    });
}

async function upsertTranslations(
  db: Db,
  batch: SeedExercise[],
): Promise<string[]> {
  const rows = await db
    .insert(exerciseTranslations)
    .values(
      batch.map((exercise) => ({
        exerciseId: exercise.id,
        locale: 'en' as const,
        name: exercise.name,
        instructions: exercise.instructions,
      })),
    )
    .onConflictDoUpdate({
      target: [exerciseTranslations.exerciseId, exerciseTranslations.locale],
      set: {
        name: sql`excluded.name`,
        instructions: sql`excluded.instructions`,
      },
      setWhere: sql`(${exerciseTranslations.name}, ${exerciseTranslations.instructions})
        is distinct from
        (excluded.name, excluded.instructions)`,
    })
    .returning({ exerciseId: exerciseTranslations.exerciseId });
  return rows.map((row) => row.exerciseId);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}
