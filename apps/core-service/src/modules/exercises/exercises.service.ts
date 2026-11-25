import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { LOCALES, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { UsersRepository } from '../users/users.repository';
import {
  buildDictionaries,
  type ExerciseDictionaries,
} from './exercise-dictionaries.response';
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
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'EXERCISE_NOT_FOUND',
        'Exercise not found',
      );
    }
    return toDetails(row);
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
    imageKeys: row.image_keys,
    category: row.category,
    force: row.force,
    mechanic: row.mechanic,
    level: row.level,
    instructions: row.instructions,
  };
}
