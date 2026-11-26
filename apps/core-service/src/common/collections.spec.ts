import { describe, expect, it } from 'vitest';
import { camelizeKeys } from './camelize';
import { groupBy } from './collections';

describe('groupBy', () => {
  it('keeps the order of first appearance and of items', () => {
    const groups = groupBy([1, 2, 3, 4, 5], (value) => value % 2);

    expect([...groups]).toEqual([
      [1, [1, 3, 5]],
      [0, [2, 4]],
    ]);
  });
});

describe('camelizeKeys', () => {
  it('converts snake_case keys and leaves values alone', () => {
    expect(
      camelizeKeys({ session_exercise_id: 'x', n: 1, a_b_c: null }),
    ).toEqual({ sessionExerciseId: 'x', n: 1, aBC: null });
  });
});
