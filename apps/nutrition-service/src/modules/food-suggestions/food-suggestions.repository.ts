import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { uuidV7 } from '../../common/uuid-v7';
import type { Executor } from '../../db/executor';
import { userFoods } from '../../db/schema';
import { escapeLike } from './name-key';

export type SuggestionRow = typeof userFoods.$inferSelect;

export type RecordedFood = Pick<
  typeof userFoods.$inferInsert,
  | 'name'
  | 'nameKey'
  | 'amount'
  | 'unit'
  | 'meal'
  | 'caloriesKcal'
  | 'proteinG'
  | 'fatG'
  | 'carbsG'
>;

@Injectable()
export class FoodSuggestionsRepository {
  async record(
    exec: Executor,
    userId: string,
    food: RecordedFood,
    countUse: boolean,
  ): Promise<string> {
    const now = new Date();
    const [row] = await exec
      .insert(userFoods)
      .values({
        id: uuidV7(),
        userId,
        ...food,
        useCount: 1,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: [userFoods.userId, userFoods.nameKey],
        set: {
          ...food,
          useCount: countUse
            ? sql`${userFoods.useCount} + 1`
            : sql`${userFoods.useCount}`,
          lastUsedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: userFoods.id });
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row.id;
  }

  search(
    exec: Executor,
    userId: string,
    nameKey: string,
    limit: number,
  ): Promise<SuggestionRow[]> {
    if (nameKey === '') {
      return exec
        .select()
        .from(userFoods)
        .where(eq(userFoods.userId, userId))
        .orderBy(desc(userFoods.lastUsedAt), asc(userFoods.id))
        .limit(limit);
    }
    const pattern = escapeLike(nameKey);
    return exec
      .select()
      .from(userFoods)
      .where(
        and(
          eq(userFoods.userId, userId),
          like(userFoods.nameKey, `%${pattern}%`),
        ),
      )
      .orderBy(
        sql`case when ${userFoods.nameKey} like ${`${pattern}%`} then 0 else 1 end`,
        desc(userFoods.useCount),
        desc(userFoods.lastUsedAt),
        asc(userFoods.id),
      )
      .limit(limit);
  }

  async remove(exec: Executor, userId: string, id: string): Promise<boolean> {
    const rows = await exec
      .delete(userFoods)
      .where(and(eq(userFoods.userId, userId), eq(userFoods.id, id)))
      .returning({ id: userFoods.id });
    return rows.length > 0;
  }
}
