import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exerciseOverridesSchema } from './free-exercise-db.schema';
import { buildSeed, loadSeed } from './load-seed';

describe('exercise seed data', () => {
  const seed = loadSeed();

  it('maps and validates the whole free-exercise-db snapshot', () => {
    expect(seed).toHaveLength(876);
  });

  it('has unique ids and source ids', () => {
    expect(new Set(seed.map((exercise) => exercise.id)).size).toBe(876);
    expect(new Set(seed.map((exercise) => exercise.sourceId)).size).toBe(876);
  });

  it('applies the overrides', () => {
    const overrides = exerciseOverridesSchema.parse(
      JSON.parse(readFileSync(join(__dirname, 'overrides.json'), 'utf8')),
    );
    for (const [sourceId, override] of Object.entries(overrides)) {
      const exercise = seed.find((item) => item.sourceId === sourceId);
      expect(exercise, sourceId).toBeDefined();
      if (override.type) {
        expect(exercise?.type, sourceId).toBe(override.type);
      }
    }
  });

  it('keeps photo keys inside the folder of the exercise', () => {
    for (const exercise of seed) {
      for (const key of exercise.imageKeys) {
        expect(
          key.startsWith(`exercises/${exercise.sourceId.toLowerCase()}/`),
        ).toBe(true);
      }
    }
  });

  it('fails on an override for an unknown exercise', () => {
    expect(() => buildSeed([], { Missing: { type: 'duration' } })).toThrow(
      /unknown exercises: Missing/,
    );
  });

  it('skips exercises marked with skip', () => {
    const snapshot = [
      {
        id: 'A',
        name: 'A',
        force: null,
        level: 'beginner' as const,
        mechanic: null,
        equipment: null,
        primaryMuscles: ['chest' as const],
        secondaryMuscles: [],
        instructions: [],
        category: 'strength' as const,
        images: [],
      },
    ];
    expect(buildSeed(snapshot, { A: { skip: true } })).toEqual([]);
  });
});
