import { Injectable } from '@nestjs/common';
import { and, asc, between, count, eq, ne, sql } from 'drizzle-orm';
import type { Executor } from '../../db/executor';
import { foodEntries } from '../../db/schema';

export type EntryRow = typeof foodEntries.$inferSelect;

export type EntryValues = Omit<
  typeof foodEntries.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

export type DayAggregate = {
  localDate: string;
  entryCount: number;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
};

@Injectable()
export class FoodLogRepository {
  async findById(
    exec: Executor,
    id: string,
  ): Promise<Pick<EntryRow, 'userId'> | null> {
    const [row] = await exec
      .select({ userId: foodEntries.userId })
      .from(foodEntries)
      .where(eq(foodEntries.id, id))
      .limit(1);
    return row ?? null;
  }

  async countOnDate(
    exec: Executor,
    userId: string,
    localDate: string,
    exceptId: string,
  ): Promise<number> {
    const [row] = await exec
      .select({ value: count() })
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, userId),
          eq(foodEntries.localDate, localDate),
          ne(foodEntries.id, exceptId),
        ),
      );
    return row?.value ?? 0;
  }

  async upsert(
    exec: Executor,
    userId: string,
    id: string,
    values: EntryValues,
  ): Promise<EntryRow> {
    const [row] = await exec
      .insert(foodEntries)
      .values({ id, userId, ...values })
      .onConflictDoUpdate({
        target: foodEntries.id,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row;
  }

  async remove(exec: Executor, userId: string, id: string): Promise<boolean> {
    const rows = await exec
      .delete(foodEntries)
      .where(and(eq(foodEntries.userId, userId), eq(foodEntries.id, id)))
      .returning({ id: foodEntries.id });
    return rows.length > 0;
  }

  listOnDate(
    exec: Executor,
    userId: string,
    localDate: string,
  ): Promise<EntryRow[]> {
    return exec
      .select()
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, userId),
          eq(foodEntries.localDate, localDate),
        ),
      )
      .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id));
  }

  aggregate(
    exec: Executor,
    userId: string,
    from: string,
    to: string,
  ): Promise<DayAggregate[]> {
    return exec
      .select({
        localDate: foodEntries.localDate,
        entryCount: sql<number>`count(*)::int`,
        caloriesKcal: sql<number>`coalesce(sum(${foodEntries.caloriesKcal}), 0)::int`,
        proteinG: sql<number>`coalesce(sum(${foodEntries.proteinG}), 0)::float8`,
        fatG: sql<number>`coalesce(sum(${foodEntries.fatG}), 0)::float8`,
        carbsG: sql<number>`coalesce(sum(${foodEntries.carbsG}), 0)::float8`,
      })
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, userId),
          between(foodEntries.localDate, from, to),
        ),
      )
      .groupBy(foodEntries.localDate)
      .orderBy(asc(foodEntries.localDate));
  }
}
