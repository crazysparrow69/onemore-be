import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { LOCALES, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { targetViolationsOf } from '../exercises/set-rules';
import { uuidV7 } from '../exercises/uuid-v7';
import { UsersRepository } from '../users/users.repository';
import { MAX_TEMPLATES, type TemplateInput } from './template-input.schema';
import type { Template, TemplateListResponse } from './template.response';
import {
  TemplatesRepository,
  type NewTemplateExercise,
  type TemplateRow,
} from './templates.repository';

const FALLBACK_LOCALE: Locale = 'en';

type Violation = { path: string; message: string };

@Injectable()
export class TemplatesService {
  constructor(
    private readonly templates: TemplatesRepository,
    private readonly users: UsersRepository,
  ) {}

  async save(
    auth: AuthUser,
    id: string,
    input: TemplateInput,
  ): Promise<{ created: boolean; template: Template }> {
    const user = await this.users.findById(auth.id);
    if (!user) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PROFILE_REQUIRED',
        'Create the profile before saving programs',
      );
    }

    const types = await this.templates.exerciseTypes(auth.id, [
      ...new Set(input.exercises.map((item) => item.exerciseId)),
    ]);
    const violations: Violation[] = [];
    const prepared: NewTemplateExercise[] = input.exercises.map(
      (item, exerciseIndex) => {
        const type = types.get(item.exerciseId);
        if (type === undefined) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'TEMPLATE_EXERCISE_NOT_FOUND',
            'The exercise does not exist or is not available',
            { path: `exercises.${exerciseIndex}.exerciseId` },
          );
        }
        return {
          id: uuidV7(),
          exerciseId: item.exerciseId,
          type,
          notes: item.notes,
          restSeconds: item.restSeconds,
          sets: item.sets.map((set, setIndex) => {
            for (const violation of targetViolationsOf(type, set)) {
              violations.push({
                path: `exercises.${exerciseIndex}.sets.${setIndex}.${violation.field}`,
                message: violation.message,
              });
            }
            return {
              id: uuidV7(),
              kind: set.kind,
              weightKg: set.weightKg,
              reps: set.reps,
              durationS: set.durationS,
              distanceM: set.distanceM,
            };
          }),
        };
      },
    );
    if (violations.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'SET_VALUES_INVALID',
        'Set values do not match the exercise type',
        violations,
      );
    }

    const result = await this.templates.save({
      id,
      ownerId: auth.id,
      name: input.name,
      notes: input.notes,
      limit: MAX_TEMPLATES,
      exercises: prepared,
    });
    if (result === 'not_found') {
      throw notFound();
    }
    if (result === 'stale') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EXERCISE_CHANGED',
        'An exercise changed while saving, try again',
      );
    }
    if (result === 'limit') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TEMPLATE_LIMIT_REACHED',
        `You can have at most ${MAX_TEMPLATES} programs`,
      );
    }
    return {
      created: result === 'created',
      template: await this.get(auth, id),
    };
  }

  async list(auth: AuthUser): Promise<TemplateListResponse> {
    const rows = await this.templates.list(auth.id);
    return { items: await this.build(auth, rows) };
  }

  async get(auth: AuthUser, id: string): Promise<Template> {
    const row = await this.templates.find(auth.id, id);
    if (!row) {
      throw notFound();
    }
    const [template] = await this.build(auth, [row]);
    if (!template) {
      throw notFound();
    }
    return template;
  }

  async archive(auth: AuthUser, id: string): Promise<void> {
    if (!(await this.templates.archive(auth.id, id))) {
      throw notFound();
    }
  }

  private async build(
    auth: AuthUser,
    rows: readonly TemplateRow[],
  ): Promise<Template[]> {
    if (rows.length === 0) {
      return [];
    }
    const user = await this.users.findById(auth.id);
    const locale =
      LOCALES.find((item) => item === user?.language) ?? FALLBACK_LOCALE;
    const exercises = await this.templates.exercisesOf(
      rows.map((row) => row.id),
      locale,
    );
    const sets = await this.templates.setsOf(exercises.map((item) => item.id));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastPerformedAt: row.lastPerformedAt?.toISOString() ?? null,
      exercises: exercises
        .filter((exercise) => exercise.templateId === row.id)
        .map((exercise) => ({
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          image: exercise.image,
          type: exercise.type,
          custom: exercise.custom,
          archived: exercise.archived,
          notes: exercise.notes,
          restSeconds: exercise.restSeconds,
          sets: sets
            .filter((set) => set.templateExerciseId === exercise.id)
            .map((set) => ({
              kind: set.kind,
              weightKg: set.weightKg,
              reps: set.reps,
              durationS: set.durationS,
              distanceM: set.distanceM,
            })),
        })),
    }));
  }
}

function notFound(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'TEMPLATE_NOT_FOUND',
    'Program not found',
  );
}
