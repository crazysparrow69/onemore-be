import { Injectable } from '@nestjs/common';
import {
  requirePlausibleToday,
  requireRecordableDate,
} from '../../common/date-guards';
import { appError } from '../../common/errors';
import { lockXact } from '../../db/locks';
import { UnitOfWork } from '../../db/unit-of-work';
import { TargetsService, nutritionLockKey } from '../targets/targets.service';
import type { WeightInput } from './weight-input.schema';
import {
  toWeightResponse,
  type WeightListResponse,
  type WeightResponse,
} from './weight.response';
import { WeightRepository, type ListFilter } from './weight.repository';

@Injectable()
export class WeightService {
  constructor(
    private readonly weight: WeightRepository,
    private readonly targets: TargetsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(userId: string, filter: ListFilter): Promise<WeightListResponse> {
    const rows = await this.weight.list(this.unitOfWork.reader, userId, filter);
    return { items: rows.map(toWeightResponse) };
  }

  async latest(userId: string): Promise<WeightResponse> {
    const row = await this.weight.latest(this.unitOfWork.reader, userId);
    if (!row) {
      throw appError('WEIGHT_NOT_FOUND');
    }
    return toWeightResponse(row);
  }

  async save(
    userId: string,
    localDate: string,
    input: WeightInput,
  ): Promise<{ created: boolean; weight: WeightResponse }> {
    requireRecordableDate(localDate);
    requirePlausibleToday(input.today);
    return this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      const existing = await this.weight.find(tx, userId, localDate);
      const saved = await this.weight.upsert(tx, userId, localDate, {
        weightKg: input.weightKg,
        note: input.note,
      });
      await this.targets.recalculate(tx, userId, input.today);
      return { created: existing === null, weight: toWeightResponse(saved) };
    });
  }

  async remove(
    userId: string,
    localDate: string,
    today: string,
  ): Promise<void> {
    requirePlausibleToday(today);
    await this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      if (!(await this.weight.remove(tx, userId, localDate))) {
        throw appError('WEIGHT_NOT_FOUND');
      }
      await this.targets.recalculate(tx, userId, today);
    });
  }
}
