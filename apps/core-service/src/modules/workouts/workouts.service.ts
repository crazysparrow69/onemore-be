import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { LOCALES, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { violationsOf } from '../exercises/set-rules';
import { uuidV7 } from '../exercises/uuid-v7';
import { UsersRepository } from '../users/users.repository';
import type { WorkoutInput } from './workout-input.schema';
import {
  defaultNameOf,
  localDateOf,
  periodViolation,
  totalsOf,
} from './workout-rules';
import type {
  PreviousSetsResponse,
  WorkoutDetails,
  WorkoutListResponse,
} from './workout.response';
import {
  WorkoutsRepository,
  type NewWorkoutExercise,
  type SessionRow,
} from './workouts.repository';

const FALLBACK_LOCALE: Locale = 'en';

type Violation = { path: string; message: string };

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly workouts: WorkoutsRepository,
    private readonly users: UsersRepository,
  ) {}

  async save(
    auth: AuthUser,
    id: string,
    input: WorkoutInput,
  ): Promise<{ created: boolean; workout: WorkoutDetails }> {
    const user = await this.users.findById(auth.id);
    if (!user) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROFILE_REQUIRED',
        'Create the profile before saving workouts',
      );
    }
    const locale = localeOf(user.language);

    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    const problem = periodViolation(startedAt, endedAt, new Date());
    if (problem !== null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'WORKOUT_TIME_INVALID',
        problem,
      );
    }

    const types = await this.workouts.exerciseTypes(auth.id, [
      ...new Set(input.exercises.map((item) => item.exerciseId)),
    ]);
    const violations: Violation[] = [];
    const kept: NewWorkoutExercise[] = [];
    input.exercises.forEach((item, exerciseIndex) => {
      const type = types.get(item.exerciseId);
      if (type === undefined) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_EXERCISE_NOT_FOUND',
          'The exercise does not exist or is not available',
          { path: `exercises.${exerciseIndex}.exerciseId` },
        );
      }
      const sets: NewWorkoutExercise['sets'] = [];
      item.sets.forEach((set, setIndex) => {
        if (set.completedAt === null) {
          return;
        }
        const found = violationsOf(type, set);
        for (const violation of found) {
          violations.push({
            path: `exercises.${exerciseIndex}.sets.${setIndex}.${violation.field}`,
            message: violation.message,
          });
        }
        sets.push({
          id: uuidV7(),
          kind: set.kind,
          weightKg: set.weightKg,
          reps: set.reps,
          durationS: set.durationS,
          distanceM: set.distanceM,
          completedAt: new Date(set.completedAt),
        });
      });
      if (sets.length > 0) {
        kept.push({
          id: uuidV7(),
          exerciseId: item.exerciseId,
          type,
          notes: item.notes,
          restSeconds: item.restSeconds,
          sets,
        });
      }
    });
    if (violations.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'SET_VALUES_INVALID',
        'Set values do not match the exercise type',
        violations,
      );
    }
    if (kept.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'WORKOUT_EMPTY',
        'Mark at least one set as completed',
      );
    }

    const result = await this.workouts.save({
      id,
      ownerId: auth.id,
      templateId: input.templateId,
      name:
        input.name.length > 0
          ? input.name
          : defaultNameOf(locale, startedAt, input.timeZone),
      notes: input.notes,
      startedAt,
      endedAt,
      localDate: localDateOf(startedAt, input.timeZone),
      timeZone: input.timeZone,
      exercises: kept,
    });
    if (result === 'foreign') {
      throw notFound();
    }
    if (result === 'stale') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EXERCISE_CHANGED',
        'An exercise changed while saving, try again',
      );
    }
    return { created: result === 'created', workout: await this.get(auth, id) };
  }

  async get(auth: AuthUser, id: string): Promise<WorkoutDetails> {
    const session = await this.workouts.findSession(auth.id, id);
    if (!session) {
      throw notFound();
    }
    const locale = await this.localeOf(auth);
    const [exercises, sets] = await this.loadChildren([session.id], locale);
    const items = exercises.map((exercise) => ({
      ...exercise,
      sets: sets.filter((set) => set.sessionExerciseId === exercise.id),
    }));
    return {
      ...toBase(session, totalsOf(session.startedAt, session.endedAt, items)),
      exercises: items.map((item) => ({
        id: item.id,
        exerciseId: item.exerciseId,
        name: item.name,
        image: item.image,
        type: item.type,
        custom: item.custom,
        notes: item.notes,
        restSeconds: item.restSeconds,
        sets: item.sets.map((set) => ({
          kind: set.kind,
          weightKg: set.weightKg,
          reps: set.reps,
          durationS: set.durationS,
          distanceM: set.distanceM,
          completedAt: set.completedAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  async list(
    auth: AuthUser,
    offset: number,
    limit: number,
  ): Promise<WorkoutListResponse> {
    const { rows, total } = await this.workouts.listSessions(
      auth.id,
      offset,
      limit,
    );
    const locale = await this.localeOf(auth);
    const [exercises, sets] = await this.loadChildren(
      rows.map((row) => row.id),
      locale,
    );
    const items = rows.map((session) => {
      const own = exercises
        .filter((exercise) => exercise.sessionId === session.id)
        .map((exercise) => ({
          ...exercise,
          sets: sets.filter((set) => set.sessionExerciseId === exercise.id),
        }));
      return {
        ...toBase(session, totalsOf(session.startedAt, session.endedAt, own)),
        exercises: own.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          image: exercise.image,
          setCount: exercise.sets.length,
        })),
      };
    });
    const end = offset + rows.length;
    return { items, total, nextOffset: end < total ? end : null };
  }

  async previousSets(
    auth: AuthUser,
    exerciseIds: readonly string[],
  ): Promise<PreviousSetsResponse> {
    const latest = await this.workouts.latestExercises(auth.id, exerciseIds);
    const sets = await this.workouts.setsOf(
      latest.map((item) => item.sessionExerciseId),
    );
    return {
      items: latest.map((item) => ({
        exerciseId: item.exerciseId,
        workoutId: item.workoutId,
        startedAt: item.startedAt.toISOString(),
        localDate: item.localDate,
        restSeconds: item.restSeconds,
        sets: sets
          .filter((set) => set.sessionExerciseId === item.sessionExerciseId)
          .map((set) => ({
            kind: set.kind,
            weightKg: set.weightKg,
            reps: set.reps,
            durationS: set.durationS,
            distanceM: set.distanceM,
          })),
      })),
    };
  }

  async remove(auth: AuthUser, id: string): Promise<void> {
    if (!(await this.workouts.remove(auth.id, id))) {
      throw notFound();
    }
  }

  private async loadChildren(sessionIds: string[], locale: Locale) {
    const exercises = await this.workouts.exercisesOf(sessionIds, locale);
    const sets = await this.workouts.setsOf(exercises.map((item) => item.id));
    return [exercises, sets] as const;
  }

  private async localeOf(auth: AuthUser): Promise<Locale> {
    const user = await this.users.findById(auth.id);
    return localeOf(user?.language);
  }
}

function localeOf(language: string | undefined): Locale {
  return LOCALES.find((locale) => locale === language) ?? FALLBACK_LOCALE;
}

function notFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_NOT_FOUND',
    'Workout not found',
  );
}

function toBase(session: SessionRow, summary: ReturnType<typeof totalsOf>) {
  return {
    id: session.id,
    templateId: session.templateId,
    name: session.name,
    notes: session.notes,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    localDate: session.localDate,
    timeZone: session.timeZone,
    summary,
  };
}
