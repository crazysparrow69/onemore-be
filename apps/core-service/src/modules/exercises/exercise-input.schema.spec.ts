import { describe, expect, it } from 'vitest';
import { exerciseInputSchema } from './exercise-input.schema';

const valid = {
  name: 'Жим у хамері однією рукою',
  type: 'weight_reps',
  primaryMuscles: ['chest'],
};

function issuePaths(value: unknown): string[] {
  const result = exerciseInputSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('exerciseInputSchema', () => {
  it('fills the defaults for the optional fields', () => {
    expect(exerciseInputSchema.parse(valid)).toEqual({
      ...valid,
      secondaryMuscles: [],
      equipment: 'none',
      instructions: [],
    });
  });

  it('trims the name and squeezes inner whitespace', () => {
    expect(
      exerciseInputSchema.parse({ ...valid, name: '  Жим \t  лежачи  ' }).name,
    ).toBe('Жим лежачи');
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['one character', 'a'],
    ['too long', 'a'.repeat(81)],
    ['control characters', 'Жим\u0007'],
  ])('rejects a name that is %s', (_label, name) => {
    expect(issuePaths({ ...valid, name })).toContain('name');
  });

  it('accepts a name of exactly 2 and 80 characters', () => {
    expect(
      exerciseInputSchema.safeParse({ ...valid, name: 'ab' }).success,
    ).toBe(true);
    expect(
      exerciseInputSchema.safeParse({ ...valid, name: 'a'.repeat(80) }).success,
    ).toBe(true);
  });

  it('rejects an unknown type, muscle and equipment', () => {
    expect(issuePaths({ ...valid, type: 'reps' })).toContain('type');
    expect(issuePaths({ ...valid, primaryMuscles: ['legs'] })).toContain(
      'primaryMuscles.0',
    );
    expect(issuePaths({ ...valid, equipment: 'rope' })).toContain('equipment');
  });

  it('requires between one and three primary muscles', () => {
    expect(issuePaths({ ...valid, primaryMuscles: [] })).toContain(
      'primaryMuscles',
    );
    expect(
      issuePaths({
        ...valid,
        primaryMuscles: ['chest', 'biceps', 'triceps', 'lats'],
      }),
    ).toContain('primaryMuscles');
    expect(
      exerciseInputSchema.safeParse({
        ...valid,
        primaryMuscles: ['chest', 'biceps', 'triceps'],
      }).success,
    ).toBe(true);
  });

  it('allows full_body, cardio and other only on their own', () => {
    for (const group of ['full_body', 'cardio', 'other']) {
      expect(
        exerciseInputSchema.safeParse({ ...valid, primaryMuscles: [group] })
          .success,
      ).toBe(true);
      expect(
        issuePaths({ ...valid, primaryMuscles: [group, 'chest'] }),
      ).toContain('primaryMuscles');
    }
  });

  it('does not allow a pseudo group as a secondary muscle', () => {
    expect(issuePaths({ ...valid, secondaryMuscles: ['cardio'] })).toContain(
      'secondaryMuscles.0',
    );
  });

  it('rejects repeated muscles and an overlap between primary and secondary', () => {
    expect(
      issuePaths({ ...valid, primaryMuscles: ['chest', 'chest'] }),
    ).toContain('primaryMuscles');
    expect(
      issuePaths({ ...valid, secondaryMuscles: ['triceps', 'triceps'] }),
    ).toContain('secondaryMuscles');
    expect(issuePaths({ ...valid, secondaryMuscles: ['chest'] })).toContain(
      'secondaryMuscles',
    );
  });

  it('trims the steps and drops the empty ones', () => {
    expect(
      exerciseInputSchema.parse({
        ...valid,
        instructions: ['  Сядь  ', '', '   ', 'Видихни'],
      }).instructions,
    ).toEqual(['Сядь', 'Видихни']);
  });

  it('limits the number and the length of the steps', () => {
    expect(
      issuePaths({
        ...valid,
        instructions: Array.from({ length: 21 }, () => 'крок'),
      }),
    ).toContain('instructions');
    expect(issuePaths({ ...valid, instructions: ['a'.repeat(501)] })).toContain(
      'instructions.0',
    );
    expect(
      exerciseInputSchema.safeParse({
        ...valid,
        instructions: Array.from({ length: 20 }, () => 'a'.repeat(500)),
      }).success,
    ).toBe(true);
  });

  it('rejects fields that are not part of the input', () => {
    expect(
      exerciseInputSchema.safeParse({ ...valid, ownerId: 'someone' }).success,
    ).toBe(false);
    expect(
      exerciseInputSchema.safeParse({ ...valid, image: 'x.webp' }).success,
    ).toBe(false);
  });
});
