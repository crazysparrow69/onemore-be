import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from '../../db/schema/exercises';
import { SET_RULES, violationsOf, type SetValues } from './set-rules';

const empty: SetValues = {
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
};

function fields(values: Partial<SetValues>): SetValues {
  return { ...empty, ...values };
}

describe('SET_RULES', () => {
  it('describes every exercise type', () => {
    expect(Object.keys(SET_RULES).sort()).toEqual([...EXERCISE_TYPES].sort());
  });
});

describe('violationsOf', () => {
  it.each([
    ['weight_reps', fields({ weightKg: 80, reps: 8 })],
    ['weight_reps', fields({ weightKg: 0, reps: 0 })],
    ['bodyweight_reps', fields({ reps: 12 })],
    ['bodyweight_reps', fields({ weightKg: -20, reps: 8 })],
    ['bodyweight_reps', fields({ weightKg: 10, reps: 8 })],
    ['duration', fields({ durationS: 60 })],
    ['distance_duration', fields({ distanceM: 5000 })],
    ['distance_duration', fields({ durationS: 1800 })],
    ['distance_duration', fields({ distanceM: 5000, durationS: 1800 })],
    ['weight_distance', fields({ weightKg: 40, distanceM: 20 })],
    ['weight_distance', fields({ weightKg: 40, distanceM: 20, durationS: 15 })],
  ] as const)('accepts %s %j', (type, values) => {
    expect(violationsOf(type, values)).toEqual([]);
  });

  it.each([
    ['weight_reps', fields({ reps: 8 }), ['weightKg']],
    ['weight_reps', fields({ weightKg: 80 }), ['reps']],
    ['weight_reps', fields({ weightKg: -5, reps: 8 }), ['weightKg']],
    [
      'weight_reps',
      fields({ weightKg: 80, reps: 8, durationS: 5 }),
      ['durationS'],
    ],
    ['bodyweight_reps', fields({ weightKg: 5 }), ['reps']],
    ['bodyweight_reps', fields({ reps: 5, distanceM: 1 }), ['distanceM']],
    ['duration', fields({}), ['durationS']],
    ['duration', fields({ durationS: 0 }), ['durationS']],
    ['duration', fields({ durationS: 30, reps: 3 }), ['reps']],
    ['distance_duration', fields({}), ['distanceM', 'durationS']],
    [
      'distance_duration',
      fields({ distanceM: 100, weightKg: 1 }),
      ['weightKg'],
    ],
    ['weight_distance', fields({ weightKg: 40 }), ['distanceM']],
    ['weight_distance', fields({ distanceM: 20 }), ['weightKg']],
    [
      'weight_distance',
      fields({ weightKg: 40, distanceM: 20, reps: 1 }),
      ['reps'],
    ],
  ] as const)('rejects %s %j', (type, values, expected) => {
    expect(
      violationsOf(type, values)
        .map((violation) => violation.field)
        .sort(),
    ).toEqual([...expected].sort());
  });

  it('keeps values inside the documented bounds', () => {
    expect(
      violationsOf('weight_reps', fields({ weightKg: 1000, reps: 1000 })),
    ).toEqual([]);
    expect(
      violationsOf('weight_reps', fields({ weightKg: 1000.5, reps: 1 })),
    ).toHaveLength(1);
    expect(
      violationsOf('bodyweight_reps', fields({ weightKg: -1001, reps: 1 })),
    ).toHaveLength(1);
  });
});
