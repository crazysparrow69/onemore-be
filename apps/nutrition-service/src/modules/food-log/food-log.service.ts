import { Injectable } from '@nestjs/common';
import { requireRecordableDate } from '../../common/date-guards';
import { appError } from '../../common/errors';
import { lockXact } from '../../db/locks';
import { PG_UNIQUE_VIOLATION, pgErrorOf } from '../../db/pg-error';
import { UnitOfWork } from '../../db/unit-of-work';
import { FoodSuggestionsService } from '../food-suggestions/food-suggestions.service';
import { TargetsService } from '../targets/targets.service';
import { remainingOf, sumTotals } from './day-totals';
import {
  MAX_ENTRIES_PER_DAY,
  type FoodEntryInput,
} from './food-entry-input.schema';
import {
  toFoodEntryResponse,
  type DayResponse,
  type DaysResponse,
  type FoodEntryResponse,
} from './food-entry.response';
import { FoodLogRepository } from './food-log.repository';

@Injectable()
export class FoodLogService {
  constructor(
    private readonly foodLog: FoodLogRepository,
    private readonly suggestions: FoodSuggestionsService,
    private readonly targets: TargetsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async save(
    userId: string,
    id: string,
    input: FoodEntryInput,
  ): Promise<{ created: boolean; entry: FoodEntryResponse }> {
    requireRecordableDate(input.localDate);
    try {
      return await this.unitOfWork.run(async (tx) => {
        await lockXact(tx, `food:${userId}`);
        const existing = await this.foodLog.findById(tx, id);
        if (existing && existing.userId !== userId) {
          throw appError('FOOD_ENTRY_NOT_FOUND');
        }
        const others = await this.foodLog.countOnDate(
          tx,
          userId,
          input.localDate,
          id,
        );
        if (others >= MAX_ENTRIES_PER_DAY) {
          throw appError('FOOD_ENTRY_LIMIT_REACHED');
        }
        const { localDate, source, ...food } = input;
        const userFoodId = await this.suggestions.record(
          tx,
          userId,
          food,
          existing === null,
        );
        const row = await this.foodLog.upsert(tx, userId, id, {
          ...food,
          localDate,
          source,
          userFoodId,
        });
        return { created: existing === null, entry: toFoodEntryResponse(row) };
      });
    } catch (error) {
      if (pgErrorOf(error)?.code === PG_UNIQUE_VIOLATION) {
        throw appError('CONFLICT');
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.foodLog.remove(this.unitOfWork.reader, userId, id))) {
      throw appError('FOOD_ENTRY_NOT_FOUND');
    }
  }

  async day(userId: string, date: string): Promise<DayResponse> {
    const rows = await this.foodLog.listOnDate(
      this.unitOfWork.reader,
      userId,
      date,
    );
    const target = await this.targets.activeOn(userId, date);
    const totals = sumTotals(rows);
    return {
      date,
      entries: rows.map(toFoodEntryResponse),
      totals,
      target,
      remaining: target ? remainingOf(target, totals) : null,
    };
  }

  async days(userId: string, from: string, to: string): Promise<DaysResponse> {
    const aggregates = await this.foodLog.aggregate(
      this.unitOfWork.reader,
      userId,
      from,
      to,
    );
    const targetOn = await this.targets.lookupFor(userId, from, to);
    return {
      items: aggregates.map((day) => ({
        date: day.localDate,
        entryCount: day.entryCount,
        totals: {
          caloriesKcal: day.caloriesKcal,
          proteinG: Math.round(day.proteinG * 10) / 10,
          fatG: Math.round(day.fatG * 10) / 10,
          carbsG: Math.round(day.carbsG * 10) / 10,
        },
        target: targetOn(day.localDate),
      })),
    };
  }
}
