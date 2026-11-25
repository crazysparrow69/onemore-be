import { describe, expect, it } from 'vitest';
import {
  exerciseIdParamsSchema,
  listExercisesQuerySchema,
} from './list-exercises.schema';

describe('listExercisesQuerySchema', () => {
  it('parses mine as a boolean', () => {
    expect(listExercisesQuerySchema.parse({ mine: 'true' }).mine).toBe(true);
    expect(listExercisesQuerySchema.parse({ mine: 'false' }).mine).toBe(false);
    expect(listExercisesQuerySchema.safeParse({ mine: 'yes' }).success).toBe(
      false,
    );
  });

  it('applies defaults to an empty query', () => {
    expect(listExercisesQuerySchema.parse({})).toEqual({
      offset: 0,
      limit: 50,
    });
  });

  it('splits comma-separated filters and coerces numbers', () => {
    expect(
      listExercisesQuerySchema.parse({
        q: '  bench ',
        muscle: 'chest,biceps',
        equipment: 'dumbbell',
        offset: '50',
        limit: '20',
      }),
    ).toEqual({
      q: 'bench',
      muscle: ['chest', 'biceps'],
      equipment: ['dumbbell'],
      offset: 50,
      limit: 20,
    });
  });

  it('treats an empty filter as no values', () => {
    expect(listExercisesQuerySchema.parse({ muscle: '' }).muscle).toEqual([]);
  });

  it.each([
    { muscle: 'wings' },
    { muscle: 'chest,wings' },
    { equipment: 'rocket' },
    { limit: '0' },
    { limit: '101' },
    { offset: '-1' },
    { offset: '1.5' },
    { q: 'x'.repeat(101) },
  ])('rejects %j', (query) => {
    expect(listExercisesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('exerciseIdParamsSchema', () => {
  it('accepts only a uuid', () => {
    expect(
      exerciseIdParamsSchema.safeParse({
        id: '0b0ea4a3-f1e0-5f0e-9f2f-6f6e3a0c9f10',
      }).success,
    ).toBe(true);
    expect(exerciseIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(
      false,
    );
  });
});
