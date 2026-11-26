import { describe, expect, it } from 'vitest';
import {
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  MIN_REST_SECONDS,
  previousSetsQuerySchema,
  workoutInputSchema,
} from './workout-input.schema';

const exerciseId = '0198b2c0-0000-7000-8000-000000000001';
const done = '2026-11-26T07:14:00Z';

const valid = {
  startedAt: '2026-11-26T07:05:00Z',
  endedAt: '2026-11-26T08:12:00Z',
  timeZone: 'Europe/Kyiv',
  exercises: [
    {
      exerciseId,
      sets: [{ kind: 'working', weightKg: 80, reps: 8, completedAt: done }],
    },
  ],
};

function issuePaths(value: unknown): string[] {
  const result = workoutInputSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('workoutInputSchema', () => {
  it('fills the defaults', () => {
    const parsed = workoutInputSchema.parse(valid);

    expect(parsed.name).toBe('');
    expect(parsed.notes).toBeNull();
    expect(parsed.exercises[0]?.notes).toBeNull();
    expect(parsed.exercises[0]?.restSeconds).toBeNull();
    expect(parsed.exercises[0]?.sets[0]).toEqual({
      kind: 'working',
      weightKg: 80,
      reps: 8,
      durationS: null,
      distanceM: null,
      completedAt: done,
    });
  });

  it('trims the name and turns blank notes into null', () => {
    const parsed = workoutInputSchema.parse({
      ...valid,
      name: '  Груди \t  і спина ',
      notes: '   ',
    });

    expect(parsed.name).toBe('Груди і спина');
    expect(parsed.notes).toBeNull();
  });

  it('rounds the weight to grams and the distance to centimetres', () => {
    const parsed = workoutInputSchema.parse({
      ...valid,
      exercises: [
        {
          exerciseId,
          sets: [
            {
              weightKg: 20.411668,
              distanceM: 12.3456,
              completedAt: done,
            },
          ],
        },
      ],
    });

    expect(parsed.exercises[0]?.sets[0]).toMatchObject({
      weightKg: 20.412,
      distanceM: 12.35,
    });
  });

  it('accepts an empty exercise list so the service can answer WORKOUT_EMPTY', () => {
    expect(
      workoutInputSchema.safeParse({ ...valid, exercises: [] }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown time zone', { ...valid, timeZone: 'Mars/Base' }, 'timeZone'],
    [
      'a start without an offset',
      { ...valid, startedAt: '2026-11-26T07:05:00' },
      'startedAt',
    ],
    ['a name that is too long', { ...valid, name: 'a'.repeat(81) }, 'name'],
    ['notes that are too long', { ...valid, notes: 'a'.repeat(1001) }, 'notes'],
    ['an unknown field', { ...valid, volume: 1 }, ''],
    [
      'an exercise id that is not a uuid',
      { ...valid, exercises: [{ exerciseId: '1', sets: [] }] },
      'exercises.0.exerciseId',
    ],
    [
      'an unknown set kind',
      { ...valid, exercises: [{ exerciseId, sets: [{ kind: 'x' }] }] },
      'exercises.0.sets.0.kind',
    ],
    [
      'negative reps',
      { ...valid, exercises: [{ exerciseId, sets: [{ reps: -1 }] }] },
      'exercises.0.sets.0.reps',
    ],
    [
      'fractional reps',
      { ...valid, exercises: [{ exerciseId, sets: [{ reps: 1.5 }] }] },
      'exercises.0.sets.0.reps',
    ],
    [
      'a weight over 1000 kg',
      { ...valid, exercises: [{ exerciseId, sets: [{ weightKg: 1001 }] }] },
      'exercises.0.sets.0.weightKg',
    ],
    [
      'a completedAt that is not a date',
      { ...valid, exercises: [{ exerciseId, sets: [{ completedAt: 'now' }] }] },
      'exercises.0.sets.0.completedAt',
    ],
  ])('rejects %s', (_label, body, path) => {
    expect(issuePaths(body)).toContain(path);
  });

  it('limits exercises and sets', () => {
    const exercises = Array.from({ length: MAX_WORKOUT_EXERCISES + 1 }, () => ({
      exerciseId,
      sets: [],
    }));
    expect(issuePaths({ ...valid, exercises })).toContain('exercises');

    const sets = Array.from({ length: MAX_SETS_PER_EXERCISE + 1 }, () => ({}));
    expect(
      issuePaths({ ...valid, exercises: [{ exerciseId, sets }] }),
    ).toContain('exercises.0.sets');
  });
});

describe('rest seconds', () => {
  const withRest = (restSeconds: unknown) => ({
    ...valid,
    exercises: [{ ...valid.exercises[0], restSeconds }],
  });

  it.each([MIN_REST_SECONDS, 90, MAX_REST_SECONDS, null])(
    'accepts %s',
    (value) => {
      expect(workoutInputSchema.safeParse(withRest(value)).success).toBe(true);
    },
  );

  it.each([0, MIN_REST_SECONDS - 1, MAX_REST_SECONDS + 1, 1.5, '90'])(
    'rejects %s',
    (value) => {
      expect(issuePaths(withRest(value))).toEqual(['exercises.0.restSeconds']);
    },
  );
});

describe('previousSetsQuerySchema', () => {
  const first = '0198b2c0-0000-7000-8000-000000000001';
  const second = '0198b2c0-0000-7000-8000-000000000002';

  it('splits the ids and removes duplicates', () => {
    const parsed = previousSetsQuerySchema.parse({
      exerciseIds: `${first},${second},${first}`,
    });

    expect(parsed.exerciseIds).toEqual([first, second]);
  });

  it.each(['', ',', 'abc', `${first},abc`])('rejects %j', (value) => {
    expect(
      previousSetsQuerySchema.safeParse({ exerciseIds: value }).success,
    ).toBe(false);
  });

  it('rejects more ids than a workout can hold', () => {
    const ids = Array.from(
      { length: MAX_WORKOUT_EXERCISES + 1 },
      (_, index) =>
        `0198b2c0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    );

    expect(
      previousSetsQuerySchema.safeParse({ exerciseIds: ids.join(',') }).success,
    ).toBe(false);
  });

  it('is required', () => {
    expect(previousSetsQuerySchema.safeParse({}).success).toBe(false);
  });
});
