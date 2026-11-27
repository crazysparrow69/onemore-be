import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../../db/executor';
import { bodyProfiles } from '../../db/schema';

export type BodyRow = typeof bodyProfiles.$inferSelect;

export type BodyValues = Omit<
  typeof bodyProfiles.$inferInsert,
  'userId' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class BodyRepository {
  async find(exec: Executor, userId: string): Promise<BodyRow | null> {
    const [row] = await exec
      .select()
      .from(bodyProfiles)
      .where(eq(bodyProfiles.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async upsert(
    exec: Executor,
    userId: string,
    values: BodyValues,
  ): Promise<BodyRow> {
    const [row] = await exec
      .insert(bodyProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: bodyProfiles.userId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row;
  }
}
