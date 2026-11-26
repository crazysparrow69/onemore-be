import { groupBy } from '../../common/collections';
import { pickSetColumns } from '../exercises/prepare-exercises';
import { totalsOf } from './workout-rules';
import type {
  PreviousSetsResponse,
  WorkoutDetails,
  WorkoutListItem,
} from './workout.response';
import type {
  PreviousExerciseRow,
  SessionExerciseRow,
  SessionRow,
  SessionSetRow,
} from './workouts.repository';

type ExerciseWithSets = SessionExerciseRow & { sets: SessionSetRow[] };

type Workout = { session: SessionRow; exercises: ExerciseWithSets[] };

export function assembleWorkouts(
  sessions: readonly SessionRow[],
  exercises: readonly SessionExerciseRow[],
  sets: readonly SessionSetRow[],
): Workout[] {
  const setsByExercise = groupBy(sets, (set) => set.sessionExerciseId);
  const exercisesBySession = groupBy(exercises, (item) => item.sessionId);
  return sessions.map((session) => ({
    session,
    exercises: (exercisesBySession.get(session.id) ?? []).map((item) => ({
      ...item,
      sets: setsByExercise.get(item.id) ?? [],
    })),
  }));
}

function baseOf({ session, exercises }: Workout) {
  return {
    id: session.id,
    templateId: session.templateId,
    name: session.name,
    notes: session.notes,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    localDate: session.localDate,
    timeZone: session.timeZone,
    summary: totalsOf(session.startedAt, session.endedAt, exercises),
  };
}

export function toWorkoutDetails(workout: Workout): WorkoutDetails {
  return {
    ...baseOf(workout),
    exercises: workout.exercises.map((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      name: item.name,
      image: item.imageKeys[0] ?? null,
      type: item.type,
      custom: item.custom,
      notes: item.notes,
      restSeconds: item.restSeconds,
      sets: item.sets.map((set) => ({
        ...pickSetColumns(set),
        completedAt: set.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export function toWorkoutListItem(workout: Workout): WorkoutListItem {
  return {
    ...baseOf(workout),
    exercises: workout.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      name: item.name,
      image: item.imageKeys[0] ?? null,
      setCount: item.sets.length,
    })),
  };
}

export function toPreviousSets(
  latest: readonly PreviousExerciseRow[],
  sets: readonly SessionSetRow[],
): PreviousSetsResponse {
  const setsByExercise = groupBy(sets, (set) => set.sessionExerciseId);
  return {
    items: latest.map((item) => ({
      exerciseId: item.exerciseId,
      workoutId: item.workoutId,
      startedAt: item.startedAt.toISOString(),
      localDate: item.localDate,
      restSeconds: item.restSeconds,
      sets: (setsByExercise.get(item.sessionExerciseId) ?? []).map(
        pickSetColumns,
      ),
    })),
  };
}
