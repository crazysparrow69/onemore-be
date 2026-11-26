import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { LOCALES, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { UsersRepository } from '../users/users.repository';
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
  ExerciseListResponse,
} from './exercise.response';
import {
  ExercisesRepository,
  FALLBACK_LOCALE,
  type ExerciseDetailsRow,
  type ExerciseListRow,
} from './exercises.repository';
import type { ListExercisesQuery } from './list-exercises.schema';
import { uuidV7 } from './uuid-v7';

@Injectable()
export class ExercisesService {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly users: UsersRepository,
  ) {}

  async list(
    auth: AuthUser,
    query: ListExercisesQuery,
  ): Promise<ExerciseListResponse> {
    const locale = await this.localeOf(auth);
    const rows = await this.exercises.search({
      userId: auth.id,
      locale,
      plan: buildSearchPlan(query.q),
      muscles: query.muscle ?? [],
      equipment: query.equipment ?? [],
      mine: query.mine ?? false,
      limit: query.limit,
      offset: query.offset,
    });
    const total = rows[0]?.total ?? 0;
    const end = query.offset + rows.length;
    return {
      items: rows.map(toListItem),
      total,
      nextOffset: end < total ? end : null,
    };
  }

  async get(auth: AuthUser, id: string): Promise<ExerciseDetails> {
    const locale = await this.localeOf(auth);
    const row = await this.exercises.findById(auth.id, locale, id);
    if (!row) {
      throw notFound();
    }
    return toDetails(row);
  }

  async create(auth: AuthUser, input: ExerciseInput): Promise<ExerciseDetails> {
    const user = await this.users.findById(auth.id);
    if (!user) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROFILE_REQUIRED',
        'Create the profile before adding exercises',
      );
    }
    const id = uuidV7();
    const created = await this.exercises.create({
      id,
      userId: auth.id,
      locale:
        LOCALES.find((locale) => locale === user.language) ?? FALLBACK_LOCALE,
      input,
      limit: MAX_CUSTOM_EXERCISES,
    });
    if (!created) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EXERCISE_LIMIT_REACHED',
        `At most ${MAX_CUSTOM_EXERCISES} own exercises are allowed`,
      );
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
      throw notFound();
    }
    if (result === 'type_locked') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EXERCISE_TYPE_LOCKED',
        'The type cannot change because the exercise is used in a workout or a program',
      );
    }
    return this.get(auth, id);
  }

  async archive(auth: AuthUser, id: string): Promise<void> {
    await this.requireOwn(auth, id);
    if (!(await this.exercises.archive(id, auth.id))) {
      throw notFound();
    }
  }

  private async requireOwn(auth: AuthUser, id: string): Promise<void> {
    const ownership = await this.exercises.findOwnership(id);
    if (!ownership) {
      throw notFound();
    }
    if (ownership.ownerId === null) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'EXERCISE_READ_ONLY',
        'Catalog exercises cannot be changed',
      );
    }
    if (ownership.ownerId !== auth.id || ownership.archivedAt !== null) {
      throw notFound();
    }
  }

  async dictionaries(auth: AuthUser): Promise<ExerciseDictionaries> {
    return buildDictionaries(await this.localeOf(auth));
  }

  private async localeOf(auth: AuthUser): Promise<Locale> {
    const user = await this.users.findById(auth.id);
    return (
      LOCALES.find((locale) => locale === user?.language) ?? FALLBACK_LOCALE
    );
  }
}

function notFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'EXERCISE_NOT_FOUND',
    'Exercise not found',
  );
}

function toListItem(
  row: ExerciseListRow,
): ExerciseListResponse['items'][number] {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    primaryMuscles: row.primary_muscles,
    secondaryMuscles: row.secondary_muscles,
    equipment: row.equipment,
    image: row.image_keys[0] ?? null,
    custom: row.custom,
  };
}

function toDetails(row: ExerciseDetailsRow): ExerciseDetails {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    primaryMuscles: row.primary_muscles,
    secondaryMuscles: row.secondary_muscles,
    equipment: row.equipment,
    image: row.image_keys[0] ?? null,
    custom: row.custom,
    imageKeys: row.image_keys,
    category: row.category,
    force: row.force,
    mechanic: row.mechanic,
    level: row.level,
    instructions: row.instructions,
    typeLocked: row.type_locked,
  };
}
