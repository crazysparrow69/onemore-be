import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exerciseOverridesSchema,
  freeExerciseDbSnapshotSchema,
  type ExerciseOverrides,
  type FreeExerciseDbRecord,
} from './free-exercise-db.schema';
import {
  mapExercise,
  seedExerciseSchema,
  type SeedExercise,
} from './map-exercise';

export const SNAPSHOT_FILE = 'free-exercise-db.json';
export const OVERRIDES_FILE = 'overrides.json';

export function buildSeed(
  snapshot: FreeExerciseDbRecord[],
  overrides: ExerciseOverrides,
): SeedExercise[] {
  const sourceIds = new Set(snapshot.map((record) => record.id));
  if (sourceIds.size !== snapshot.length) {
    throw new Error('Snapshot has duplicate ids');
  }
  const unknown = Object.keys(overrides).filter((id) => !sourceIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`Overrides for unknown exercises: ${unknown.join(', ')}`);
  }

  const seed: SeedExercise[] = [];
  const issues: string[] = [];
  for (const record of snapshot) {
    const override = overrides[record.id];
    if (override?.skip) {
      continue;
    }
    const parsed = seedExerciseSchema.safeParse(mapExercise(record, override));
    if (parsed.success) {
      seed.push(parsed.data);
    } else {
      issues.push(
        `${record.id}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      );
    }
  }
  if (issues.length > 0) {
    throw new Error(`Invalid seed exercises: ${issues.join(' | ')}`);
  }
  return seed;
}

export function loadSeed(folder: string = __dirname): SeedExercise[] {
  const snapshot = freeExerciseDbSnapshotSchema.parse(
    readJson(join(folder, SNAPSHOT_FILE)),
  );
  const overrides = exerciseOverridesSchema.parse(
    readJson(join(folder, OVERRIDES_FILE)),
  );
  return buildSeed(snapshot, overrides);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
