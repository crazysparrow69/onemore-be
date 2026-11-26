import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ExerciseType } from '../../db/schema/exercises';
import { prepareExercises, type SetColumns } from './prepare-exercises';
import { violationsOf } from './set-rules';

const BENCH = '0198f0a0-0000-7000-8000-000000000001';
const GHOST = '0198f0a0-0000-7000-8000-000000000002';

const set = (patch: Partial<SetColumns> = {}): SetColumns => ({
  kind: 'working',
  weightKg: 60,
  reps: 8,
  durationS: null,
  distanceM: null,
  ...patch,
});

const prepare = (
  exercises: { exerciseId: string; sets: SetColumns[] }[],
  select?: (set: SetColumns) => object | null,
) =>
  prepareExercises({
    exercises: exercises.map((item) => ({
      notes: null,
      restSeconds: null,
      ...item,
    })),
    types: new Map<string, ExerciseType>([[BENCH, 'weight_reps']]),
    missing: 'WORKOUT_EXERCISE_NOT_FOUND',
    check: violationsOf,
    select,
  });

function failureOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpException) {
      return error.getResponse();
    }
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('prepareExercises', () => {
  it('assigns ids and keeps the exercise type', () => {
    const [exercise] = prepare([{ exerciseId: BENCH, sets: [set(), set()] }]);

    expect(exercise?.type).toBe('weight_reps');
    expect(exercise?.sets).toHaveLength(2);
    expect(exercise?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(exercise?.sets.map((item) => item.id)).size).toBe(2);
  });

  it('fails with the given code and the path of an unknown exercise', () => {
    const body = failureOf(() =>
      prepare([
        { exerciseId: BENCH, sets: [set()] },
        { exerciseId: GHOST, sets: [set()] },
      ]),
    );

    expect(body).toMatchObject({
      code: 'WORKOUT_EXERCISE_NOT_FOUND',
      details: { path: 'exercises.1.exerciseId' },
    });
  });

  it('collects every violation with its path', () => {
    const body = failureOf(() =>
      prepare([
        {
          exerciseId: BENCH,
          sets: [set(), set({ reps: null }), set({ weightKg: null })],
        },
      ]),
    );

    expect(body).toMatchObject({
      code: 'SET_VALUES_INVALID',
      details: [
        { path: 'exercises.0.sets.1.reps' },
        { path: 'exercises.0.sets.2.weightKg' },
      ],
    });
  });

  it('skips sets the selector drops and merges the extra columns', () => {
    const [exercise] = prepare(
      [{ exerciseId: BENCH, sets: [set({ reps: 1 }), set({ reps: 2 })] }],
      (item) => (item.reps === 1 ? null : { completed: true }),
    );

    expect(exercise?.sets).toHaveLength(1);
    expect(exercise?.sets[0]).toMatchObject({ reps: 2, completed: true });
  });
});
