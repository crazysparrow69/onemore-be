import { Injectable } from '@nestjs/common';
import { appError } from '../../common/errors';
import type { AuthUser } from '../auth/auth.types';
import { ExercisesService } from '../exercises/exercises.service';
import { prepareExercises } from '../exercises/prepare-exercises';
import { targetViolationsOf } from '../exercises/set-rules';
import { UsersService } from '../users/users.service';
import { MAX_TEMPLATES, type TemplateInput } from './template-input.schema';
import { toTemplates } from './template.mapper';
import type { Template, TemplateListResponse } from './template.response';
import { TemplatesRepository, type TemplateRow } from './templates.repository';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly templates: TemplatesRepository,
    private readonly users: UsersService,
    private readonly exercises: ExercisesService,
  ) {}

  async save(
    auth: AuthUser,
    id: string,
    input: TemplateInput,
  ): Promise<{ created: boolean; template: Template }> {
    await this.users.requireProfile(auth.id);

    const planned = prepareExercises({
      exercises: input.exercises,
      types: await this.exercises.typesOf(
        auth.id,
        input.exercises.map((item) => item.exerciseId),
      ),
      missing: 'TEMPLATE_EXERCISE_NOT_FOUND',
      check: targetViolationsOf,
    });

    const result = await this.templates.save({
      id,
      ownerId: auth.id,
      name: input.name,
      notes: input.notes,
      limit: MAX_TEMPLATES,
      exercises: planned,
    });
    if (result === 'not_found') {
      throw appError('TEMPLATE_NOT_FOUND');
    }
    if (result === 'stale') {
      throw appError('EXERCISE_CHANGED');
    }
    if (result === 'limit') {
      throw appError('TEMPLATE_LIMIT_REACHED', {
        message: `You can have at most ${MAX_TEMPLATES} programs`,
      });
    }
    return {
      created: result === 'created',
      template: await this.get(auth, id),
    };
  }

  async list(auth: AuthUser): Promise<TemplateListResponse> {
    return {
      items: await this.assemble(auth.id, await this.templates.list(auth.id)),
    };
  }

  async get(auth: AuthUser, id: string): Promise<Template> {
    const row = await this.templates.find(auth.id, id);
    const [template] = row ? await this.assemble(auth.id, [row]) : [];
    if (!template) {
      throw appError('TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  async archive(auth: AuthUser, id: string): Promise<void> {
    if (!(await this.templates.archive(auth.id, id))) {
      throw appError('TEMPLATE_NOT_FOUND');
    }
  }

  private async assemble(
    userId: string,
    rows: readonly TemplateRow[],
  ): Promise<Template[]> {
    if (rows.length === 0) {
      return [];
    }
    const exercises = await this.templates.exercisesOf(
      rows.map((row) => row.id),
      await this.users.localeOf(userId),
    );
    const sets = await this.templates.setsOf(exercises.map((item) => item.id));
    return toTemplates(rows, exercises, sets);
  }
}
