import { Injectable } from '@nestjs/common';
import { requirePlausibleToday } from '../../common/date-guards';
import { notBefore } from '../../common/dates';
import { appError } from '../../common/errors';
import { lockXact } from '../../db/locks';
import { UnitOfWork } from '../../db/unit-of-work';
import { TargetsService, nutritionLockKey } from '../targets/targets.service';
import type { GoalInput } from './goal-input.schema';
import { toGoalResponse, type GoalResponse } from './goal.response';
import { GoalsRepository } from './goals.repository';

@Injectable()
export class GoalsService {
  constructor(
    private readonly goals: GoalsRepository,
    private readonly targets: TargetsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async current(userId: string): Promise<GoalResponse> {
    const row = await this.goals.latest(this.unitOfWork.reader, userId);
    if (!row) {
      throw appError('GOAL_NOT_FOUND');
    }
    return toGoalResponse(row);
  }

  async save(userId: string, input: GoalInput): Promise<GoalResponse> {
    requirePlausibleToday(input.today);
    const directional = input.type === 'lose' || input.type === 'gain';
    const row = await this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      const latest = await this.goals.latest(tx, userId);
      const saved = await this.goals.upsert(
        tx,
        userId,
        notBefore(input.today, latest?.effectiveFrom ?? null),
        {
          type: input.type,
          rateKgPerWeek: directional ? input.rateKgPerWeek : null,
          targetWeightKg: input.targetWeightKg,
        },
      );
      await this.targets.recalculate(tx, userId, input.today);
      return saved;
    });
    return toGoalResponse(row);
  }
}
