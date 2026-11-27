import { Injectable } from '@nestjs/common';
import { requirePlausibleToday } from '../../common/date-guards';
import { appError } from '../../common/errors';
import { lockXact } from '../../db/locks';
import { UnitOfWork } from '../../db/unit-of-work';
import { TargetsService, nutritionLockKey } from '../targets/targets.service';
import type { BodyInput } from './body-input.schema';
import { toBodyResponse, type BodyResponse } from './body.response';
import { BodyRepository } from './body.repository';

@Injectable()
export class BodyService {
  constructor(
    private readonly body: BodyRepository,
    private readonly targets: TargetsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(userId: string): Promise<BodyResponse> {
    const row = await this.body.find(this.unitOfWork.reader, userId);
    if (!row) {
      throw appError('BODY_PROFILE_NOT_FOUND');
    }
    return toBodyResponse(row);
  }

  async save(userId: string, input: BodyInput): Promise<BodyResponse> {
    requirePlausibleToday(input.today);
    const { today, ...values } = input;
    const row = await this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      const saved = await this.body.upsert(tx, userId, values);
      await this.targets.recalculate(tx, userId, today);
      return saved;
    });
    return toBodyResponse(row);
  }
}
