import { describe, expect, it } from 'vitest';
import {
  MAX_TEMPLATE_EXERCISES,
  MAX_TEMPLATE_SETS,
  templateInputSchema,
} from './template-input.schema';

const exerciseId = '0198b2c0-0000-7000-8000-000000000001';

const valid = {
  name: 'Ноги і плечі',
  exercises: [
    {
      exerciseId,
      sets: [{ kind: 'working', weightKg: 80, reps: 12 }],
    },
  ],
};

function issuePaths(value: unknown): string[] {
  const result = templateInputSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('templateInputSchema', () => {
  it('fills the defaults', () => {
    const parsed = templateInputSchema.parse(valid);

    expect(parsed.notes).toBeNull();
    expect(parsed.exercises[0]?.notes).toBeNull();
    expect(parsed.exercises[0]?.restSeconds).toBeNull();
    expect(parsed.exercises[0]?.sets[0]).toEqual({
      kind: 'working',
      weightKg: 80,
      reps: 12,
      durationS: null,
      distanceM: null,
    });
  });

  it('accepts sets without any target values', () => {
    const parsed = templateInputSchema.parse({
      ...valid,
      exercises: [{ exerciseId, sets: [{}, {}] }],
    });

    expect(parsed.exercises[0]?.sets).toHaveLength(2);
    expect(parsed.exercises[0]?.sets[0]?.kind).toBe('working');
  });

  it('trims and collapses the name', () => {
    expect(
      templateInputSchema.parse({ ...valid, name: '  Ноги \t  і плечі ' }).name,
    ).toBe('Ноги і плечі');
  });

  it.each([
    ['empty name', { ...valid, name: '   ' }, 'name'],
    ['long name', { ...valid, name: 'a'.repeat(81) }, 'name'],
    ['control character in name', { ...valid, name: 'a\u0000b' }, 'name'],
    ['no exercises', { ...valid, exercises: [] }, 'exercises'],
    [
      'no sets',
      { ...valid, exercises: [{ exerciseId, sets: [] }] },
      'exercises.0.sets',
    ],
    [
      'completedAt is not part of a program',
      {
        ...valid,
        exercises: [
          {
            exerciseId,
            sets: [
              { weightKg: 1, reps: 1, completedAt: '2026-11-26T07:14:00Z' },
            ],
          },
        ],
      },
      'exercises.0.sets.0',
    ],
    ['unknown field', { ...valid, color: 'red' }, ''],
    [
      'rest below the minimum',
      { ...valid, exercises: [{ exerciseId, restSeconds: 4, sets: [{}] }] },
      'exercises.0.restSeconds',
    ],
    [
      'bad exercise id',
      { ...valid, exercises: [{ exerciseId: 'x', sets: [{}] }] },
      'exercises.0.exerciseId',
    ],
    [
      'bad set kind',
      { ...valid, exercises: [{ exerciseId, sets: [{ kind: 'super' }] }] },
      'exercises.0.sets.0.kind',
    ],
  ])('rejects %s', (_label, value, path) => {
    expect(issuePaths(value)).toContain(path);
  });

  it('limits exercises and sets', () => {
    const many = Array.from({ length: MAX_TEMPLATE_EXERCISES + 1 }, () => ({
      exerciseId,
      sets: [{}],
    }));
    expect(issuePaths({ ...valid, exercises: many })).toContain('exercises');

    const sets = Array.from({ length: MAX_TEMPLATE_SETS + 1 }, () => ({}));
    expect(
      issuePaths({ ...valid, exercises: [{ exerciseId, sets }] }),
    ).toContain('exercises.0.sets');
  });
});
