import { Injectable } from '@nestjs/common';
import { appError } from '../../common/errors';
import type { Executor } from '../../db/executor';
import { UnitOfWork } from '../../db/unit-of-work';
import { FoodSuggestionsRepository } from './food-suggestions.repository';
import { toNameKey } from './name-key';
import {
  toSuggestionResponse,
  type SuggestionListResponse,
} from './suggestion.response';
import type { AmountUnit, Meal } from '../../db/schema';

export type FoodToRecord = {
  name: string;
  amount: number | null;
  unit: AmountUnit | null;
  meal: Meal;
  caloriesKcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
};

@Injectable()
export class FoodSuggestionsService {
  constructor(
    private readonly suggestions: FoodSuggestionsRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SuggestionListResponse> {
    const rows = await this.suggestions.search(
      this.unitOfWork.reader,
      userId,
      toNameKey(query),
      limit,
    );
    return { items: rows.map(toSuggestionResponse) };
  }

  record(
    tx: Executor,
    userId: string,
    food: FoodToRecord,
    countUse: boolean,
  ): Promise<string> {
    return this.suggestions.record(
      tx,
      userId,
      { ...food, nameKey: toNameKey(food.name) },
      countUse,
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.suggestions.remove(this.unitOfWork.reader, userId, id))) {
      throw appError('SUGGESTION_NOT_FOUND');
    }
  }
}
