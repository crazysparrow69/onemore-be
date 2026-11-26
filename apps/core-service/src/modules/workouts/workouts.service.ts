import { Injectable } from '@nestjs/common';
import { appError } from '../../common/errors';
import { toPage } from '../../common/pagination';
import type { AuthUser } from '../auth/auth.types';
import { ExercisesService } from '../exercises/exercises.service';
import { prepareExercises } from '../exercises/prepare-exercises';
import { violationsOf } from '../exercises/set-rules';
import { toLocale } from '../../db/schema/locales';
import { UsersService } from '../users/users.service';
import type { WorkoutInput } from './workout-input.schema';
import {
  assembleWorkouts,
  toPreviousSets,
  toWorkoutDetails,
  toWorkoutListItem,
} from './workout.mapper';
import { defaultNameOf, localDateOf, periodViolation } from './workout-rules';
import type {
  PreviousSetsResponse,
  WorkoutDetails,
  WorkoutListResponse,
} from './workout.response';
import { WorkoutsRepository, type SessionRow } from './workouts.repository';

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly workouts: WorkoutsRepository,
    private readonly users: UsersService,
    private readonly exercises: ExercisesService,
  ) {}

  async save(
    auth: AuthUser,
    id: string,
    input: WorkoutInput,
  ): Promise<{ created: boolean; workout: WorkoutDetails }> {
    const user = await this.users.requireProfile(auth.id);

    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    const problem = periodViolation(startedAt, endedAt, new Date());
    if (problem !== null) {
      throw appError('WORKOUT_TIME_INVALID', { message: problem });
    }

    const planned = prepareExercises({
      exercises: input.exercises,
      types: await this.exercises.typesOf(
        auth.id,
        input.exercises.map((item) => item.exerciseId),
      ),
      missing: 'WORKOUT_EXERCISE_NOT_FOUND',
      check: violationsOf,
      select: (set) =>
        set.completedAt === null
          ? null
          : { completedAt: new Date(set.completedAt) },
    }).filter((item) => item.sets.length > 0);
    if (planned.length === 0) {
      throw appError('WORKOUT_EMPTY');
    }

    const result = await this.workouts.save({
      id,
      ownerId: auth.id,
      templateId: input.templateId,
      name:
        input.name.length > 0
          ? input.name
          : defaultNameOf(toLocale(user.language), startedAt, input.timeZone),
      notes: input.notes,
      startedAt,
      endedAt,
      localDate: localDateOf(startedAt, input.timeZone),
      timeZone: input.timeZone,
      exercises: planned,
    });
    if (result === 'foreign') {
      throw appError('WORKOUT_NOT_FOUND');
    }
    if (result === 'stale') {
      throw appError('EXERCISE_CHANGED');
    }
    return { created: result === 'created', workout: await this.get(auth, id) };
  }

  async get(auth: AuthUser, id: string): Promise<WorkoutDetails> {
    const session = await this.workouts.findSession(auth.id, id);
    if (!session) {
      throw appError('WORKOUT_NOT_FOUND');
    }
    const [workout] = await this.assemble(auth.id, [session]);
    if (!workout) {
      throw appError('WORKOUT_NOT_FOUND');
    }
    return toWorkoutDetails(workout);
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
    const workouts = await this.assemble(auth.id, rows);
    return toPage(workouts.map(toWorkoutListItem), total, offset);
  }

  async previousSets(
    auth: AuthUser,
    exerciseIds: readonly string[],
  ): Promise<PreviousSetsResponse> {
    const latest = await this.workouts.latestExercises(auth.id, exerciseIds);
    const sets = await this.workouts.setsOf(
      latest.map((item) => item.sessionExerciseId),
    );
    return toPreviousSets(latest, sets);
  }

  async remove(auth: AuthUser, id: string): Promise<void> {
    if (!(await this.workouts.remove(auth.id, id))) {
      throw appError('WORKOUT_NOT_FOUND');
    }
  }

  private async assemble(userId: string, sessions: readonly SessionRow[]) {
    const locale = await this.users.localeOf(userId);
    const exercises = await this.workouts.exercisesOf(
      sessions.map((session) => session.id),
      locale,
    );
    const sets = await this.workouts.setsOf(exercises.map((item) => item.id));
    return assembleWorkouts(sessions, exercises, sets);
  }
}
