import { appError, type ErrorCode } from '../../common/errors';
import { uuidV7 } from '../../common/uuid-v7';
import type { ExerciseType } from '../../db/schema/exercises';
import type { SetKind } from '../../db/schema/workouts';
import type { SetValues, SetViolation } from './set-rules';

export type SetColumns = {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type PlannedSet<Extra extends object = object> = SetColumns &
  Extra & { id: string };

export type PlannedExercise<Extra extends object = object> = {
  id: string;
  exerciseId: string;
  type: ExerciseType;
  notes: string | null;
  restSeconds: number | null;
  sets: PlannedSet<Extra>[];
};

type ExerciseInput<S> = {
  exerciseId: string;
  notes: string | null;
  restSeconds: number | null;
  sets: readonly S[];
};

type Violation = { path: string; message: string };

export function pickSetColumns(set: SetColumns): SetColumns {
  return {
    kind: set.kind,
    weightKg: set.weightKg,
    reps: set.reps,
    durationS: set.durationS,
    distanceM: set.distanceM,
  };
}

export function prepareExercises<
  S extends SetColumns,
  Extra extends object = object,
>(options: {
  exercises: readonly ExerciseInput<S>[];
  types: ReadonlyMap<string, ExerciseType>;
  missing: ErrorCode;
  check: (type: ExerciseType, values: SetValues) => SetViolation[];
  select?: (set: S) => Extra | null;
}): PlannedExercise<Extra>[] {
  const { exercises, types, missing, check } = options;
  const select = options.select ?? (() => ({}) as Extra);
  const violations: Violation[] = [];

  const planned = exercises.map((item, exerciseIndex) => {
    const type = types.get(item.exerciseId);
    if (type === undefined) {
      throw appError(missing, {
        details: { path: `exercises.${exerciseIndex}.exerciseId` },
      });
    }
    const sets: PlannedSet<Extra>[] = [];
    item.sets.forEach((set, setIndex) => {
      const extra = select(set);
      if (extra === null) {
        return;
      }
      for (const violation of check(type, set)) {
        violations.push({
          path: `exercises.${exerciseIndex}.sets.${setIndex}.${violation.field}`,
          message: violation.message,
        });
      }
      sets.push({ ...pickSetColumns(set), ...extra, id: uuidV7() });
    });
    return {
      id: uuidV7(),
      exerciseId: item.exerciseId,
      type,
      notes: item.notes,
      restSeconds: item.restSeconds,
      sets,
    };
  });

  if (violations.length > 0) {
    throw appError('SET_VALUES_INVALID', { details: violations });
  }
  return planned;
}
