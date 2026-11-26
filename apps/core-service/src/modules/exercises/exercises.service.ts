import { Injectable } from '@nestjs/common';
import { toPage } from '../../common/pagination';
import { appError } from '../../common/errors';
import { uuidV7 } from '../../common/uuid-v7';
import { toLocale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { MediaService } from '../media/media.service';
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
  type ExerciseOwnership,
  type ExerciseListRow,
  type UpdateOutcome,
} from './exercises.repository';
import type { ListExercisesQuery } from './list-exercises.schema';

@Injectable()
export class ExercisesService {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly users: UsersService,
    private readonly media: MediaService,
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
    if (input.photoId) {
      await this.media.claim(auth.id, input.photoId, 'exercise_photo');
    }
    let created: boolean;
    try {
      created = await this.exercises.create({
        id,
        userId: auth.id,
        locale: toLocale(user.language),
        input,
        limit: MAX_CUSTOM_EXERCISES,
      });
    } catch (error) {
      await this.unclaim(auth.id, input.photoId);
      throw error;
    }
    if (!created) {
      await this.unclaim(auth.id, input.photoId);
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
    const ownership = await this.requireOwn(auth, id);
    const claimed =
      input.photoId !== null && input.photoId !== ownership.photoId
        ? input.photoId
        : null;
    if (claimed) {
      await this.media.claim(auth.id, claimed, 'exercise_photo');
    }
    let outcome: UpdateOutcome;
    try {
      outcome = await this.exercises.update(id, auth.id, input);
    } catch (error) {
      await this.unclaim(auth.id, claimed);
      throw error;
    }
    if (outcome.result !== 'updated') {
      await this.unclaim(auth.id, claimed);
      throw appError(
        outcome.result === 'not_found'
          ? 'EXERCISE_NOT_FOUND'
          : 'EXERCISE_TYPE_LOCKED',
      );
    }
    if (outcome.replacedPhotoId) {
      await this.media.release(auth.id, outcome.replacedPhotoId);
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

  private async unclaim(userId: string, photoId: string | null): Promise<void> {
    if (photoId) {
      await this.media.unclaim(userId, photoId);
    }
  }

  private async requireOwn(
    auth: AuthUser,
    id: string,
  ): Promise<ExerciseOwnership> {
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
    return ownership;
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
    photoId: row.photoId,
    typeLocked: row.typeLocked,
  };
}
