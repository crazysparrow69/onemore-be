import { Injectable } from '@nestjs/common';
import { toPage } from '../../common/pagination';
import { appError } from '../../common/errors';
import { uuidV7 } from '../../common/uuid-v7';
import { toLocale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';
import {
  buildDictionaries,
  type ExerciseDictionaries,
} from './exercise-dictionaries.response';
import {
  MAX_CUSTOM_EXERCISES,
  type ExerciseInput,
} from './exercise-input.schema';
import { buildSearchPlan } from './exercise-search';
import type {
  ExerciseDetails,
  ExerciseListItem,
  ExerciseListResponse,
} from './exercise.response';
import {
  ExercisesRepository,
  type ExerciseDetailsRow,
  type ExerciseListRow,
} from './exercises.repository';
import type { ListExercisesQuery } from './list-exercises.schema';

@Injectable()
export class ExercisesService {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly users: UsersService,
  ) {}

  async list(
    auth: AuthUser,
    query: ListExercisesQuery,
  ): Promise<ExerciseListResponse> {
    const rows = await this.exercises.search({
      userId: auth.id,
      locale: await this.users.localeOf(auth.id),
      plan: buildSearchPlan(query.q),
      muscles: query.muscle ?? [],
      equipment: query.equipment ?? [],
      mine: query.mine ?? false,
      limit: query.limit,
      offset: query.offset,
    });
    return toPage(rows.map(toListItem), rows[0]?.total ?? 0, query.offset);
  }

  async get(auth: AuthUser, id: string): Promise<ExerciseDetails> {
    const locale = await this.users.localeOf(auth.id);
    const row = await this.exercises.findById(auth.id, locale, id);
    if (!row) {
      throw appError('EXERCISE_NOT_FOUND');
    }
    return toDetails(row);
  }

  async create(auth: AuthUser, input: ExerciseInput): Promise<ExerciseDetails> {
    const user = await this.users.requireProfile(auth.id);
    const id = uuidV7();
    const created = await this.exercises.create({
      id,
      userId: auth.id,
      locale: toLocale(user.language),
      input,
      limit: MAX_CUSTOM_EXERCISES,
    });
    if (!created) {
      throw appError('EXERCISE_LIMIT_REACHED', {
        message: `At most ${MAX_CUSTOM_EXERCISES} own exercises are allowed`,
      });
    }
    return this.get(auth, id);
  }

  async update(
    auth: AuthUser,
    id: string,
    input: ExerciseInput,
  ): Promise<ExerciseDetails> {
    await this.requireOwn(auth, id);
    const result = await this.exercises.update(id, auth.id, input);
    if (result === 'not_found') {
      throw appError('EXERCISE_NOT_FOUND');
    }
    if (result === 'type_locked') {
      throw appError('EXERCISE_TYPE_LOCKED');
    }
    return this.get(auth, id);
  }

  async archive(auth: AuthUser, id: string): Promise<void> {
    await this.requireOwn(auth, id);
    if (!(await this.exercises.archive(id, auth.id))) {
      throw appError('EXERCISE_NOT_FOUND');
    }
  }

  async dictionaries(auth: AuthUser): Promise<ExerciseDictionaries> {
    return buildDictionaries(await this.users.localeOf(auth.id));
  }

  typesOf(userId: string, ids: readonly string[]) {
    return this.exercises.typesVisibleTo(userId, ids);
  }

  private async requireOwn(auth: AuthUser, id: string): Promise<void> {
    const ownership = await this.exercises.findOwnership(id);
    if (!ownership) {
      throw appError('EXERCISE_NOT_FOUND');
    }
    if (ownership.ownerId === null) {
      throw appError('EXERCISE_READ_ONLY');
    }
    if (ownership.ownerId !== auth.id || ownership.archivedAt !== null) {
      throw appError('EXERCISE_NOT_FOUND');
    }
  }
}

function toListItem(
  row: ExerciseListRow | ExerciseDetailsRow,
): ExerciseListItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    primaryMuscles: row.primaryMuscles,
    secondaryMuscles: row.secondaryMuscles,
    equipment: row.equipment,
    image: row.imageKeys[0] ?? null,
    custom: row.custom,
  };
}

function toDetails(row: ExerciseDetailsRow): ExerciseDetails {
  return {
    ...toListItem(row),
    imageKeys: row.imageKeys,
    category: row.category,
    force: row.force,
    mechanic: row.mechanic,
    level: row.level,
    instructions: row.instructions,
    typeLocked: row.typeLocked,
  };
}
