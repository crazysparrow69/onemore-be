import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { uuidV7 } from '../../common/uuid-v7';
import type { Executor } from '../../db/executor';
import { goals } from '../../db/schema';

export type GoalRow = typeof goals.$inferSelect;

export type GoalValues = Pick<
  typeof goals.$inferInsert,
  'type' | 'rateKgPerWeek' | 'targetWeightKg'
>;

@Injectable()
export class GoalsRepository {
  async latest(exec: Executor, userId: string): Promise<GoalRow | null> {
    const [row] = await exec
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(desc(goals.effectiveFrom))
      .limit(1);
    return row ?? null;
  }

  async upsert(
    exec: Executor,
    userId: string,
    effectiveFrom: string,
    values: GoalValues,
  ): Promise<GoalRow> {
    const [row] = await exec
      .insert(goals)
      .values({ id: uuidV7(), userId, effectiveFrom, ...values })
      .onConflictDoUpdate({
        target: [goals.userId, goals.effectiveFrom],
        set: values,
      })
      .returning();
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row;
  }
}
