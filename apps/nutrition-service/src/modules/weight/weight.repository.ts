import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { uuidV7 } from '../../common/uuid-v7';
import type { Executor } from '../../db/executor';
import { weightEntries } from '../../db/schema';

export type WeightRow = typeof weightEntries.$inferSelect;

export type ListFilter = { from?: string; to?: string; limit: number };

@Injectable()
export class WeightRepository {
  async find(
    exec: Executor,
    userId: string,
    localDate: string,
  ): Promise<WeightRow | null> {
    const [row] = await exec
      .select()
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          eq(weightEntries.localDate, localDate),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async latest(exec: Executor, userId: string): Promise<WeightRow | null> {
    const [row] = await exec
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.localDate))
      .limit(1);
    return row ?? null;
  }

  list(
    exec: Executor,
    userId: string,
    filter: ListFilter,
  ): Promise<WeightRow[]> {
    return exec
      .select()
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          filter.from ? gte(weightEntries.localDate, filter.from) : undefined,
          filter.to ? lte(weightEntries.localDate, filter.to) : undefined,
        ),
      )
      .orderBy(desc(weightEntries.localDate))
      .limit(filter.limit);
  }

  async upsert(
    exec: Executor,
    userId: string,
    localDate: string,
    values: { weightKg: number; note: string | null },
  ): Promise<WeightRow> {
    const [row] = await exec
      .insert(weightEntries)
      .values({ id: uuidV7(), userId, localDate, ...values })
      .onConflictDoUpdate({
        target: [weightEntries.userId, weightEntries.localDate],
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row;
  }

  async remove(
    exec: Executor,
    userId: string,
    localDate: string,
  ): Promise<boolean> {
    const rows = await exec
      .delete(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          eq(weightEntries.localDate, localDate),
        ),
      )
      .returning({ id: weightEntries.id });
    return rows.length > 0;
  }
}
