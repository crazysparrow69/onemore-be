import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { uuidV7 } from '../../common/uuid-v7';
import type { Executor } from '../../db/executor';
import {
  bodyProfiles,
  goals,
  targetSnapshots,
  weightEntries,
  type TargetInputs,
  type TargetSource,
} from '../../db/schema';

export type SnapshotRow = typeof targetSnapshots.$inferSelect;

export type BodyRow = typeof bodyProfiles.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;

export type Parts = {
  body: BodyRow | null;
  goal: GoalRow | null;
  weightKg: number | null;
};

export type NewSnapshot = {
  userId: string;
  effectiveFrom: string;
  source: TargetSource;
  goalId: string | null;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  bmrKcal: number | null;
  tdeeKcal: number | null;
  floorApplied: boolean;
  formulaVersion: number | null;
  inputs: TargetInputs | null;
};

@Injectable()
export class TargetsRepository {
  async latest(exec: Executor, userId: string): Promise<SnapshotRow | null> {
    const [row] = await exec
      .select()
      .from(targetSnapshots)
      .where(eq(targetSnapshots.userId, userId))
      .orderBy(desc(targetSnapshots.effectiveFrom))
      .limit(1);
    return row ?? null;
  }

  async activeOn(
    exec: Executor,
    userId: string,
    date: string,
  ): Promise<SnapshotRow | null> {
    const [row] = await exec
      .select()
      .from(targetSnapshots)
      .where(
        and(
          eq(targetSnapshots.userId, userId),
          lte(targetSnapshots.effectiveFrom, date),
        ),
      )
      .orderBy(desc(targetSnapshots.effectiveFrom))
      .limit(1);
    return row ?? null;
  }

  async history(
    exec: Executor,
    userId: string,
    from: string,
    to: string,
  ): Promise<SnapshotRow[]> {
    const active = await this.activeOn(exec, userId, from);
    const start = active?.effectiveFrom ?? from;
    return exec
      .select()
      .from(targetSnapshots)
      .where(
        and(
          eq(targetSnapshots.userId, userId),
          gte(targetSnapshots.effectiveFrom, start),
          lte(targetSnapshots.effectiveFrom, to),
        ),
      )
      .orderBy(asc(targetSnapshots.effectiveFrom));
  }

  async upsert(exec: Executor, input: NewSnapshot): Promise<SnapshotRow> {
    const { userId, effectiveFrom, ...fields } = input;
    const [row] = await exec
      .insert(targetSnapshots)
      .values({ id: uuidV7(), userId, effectiveFrom, ...fields })
      .onConflictDoUpdate({
        target: [targetSnapshots.userId, targetSnapshots.effectiveFrom],
        set: { ...fields, createdAt: sql`now()` },
      })
      .returning();
    if (!row) {
      throw new Error('upsert returned no row');
    }
    return row;
  }

  async parts(exec: Executor, userId: string): Promise<Parts> {
    const [body] = await exec
      .select()
      .from(bodyProfiles)
      .where(eq(bodyProfiles.userId, userId))
      .limit(1);
    const [goal] = await exec
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(desc(goals.effectiveFrom))
      .limit(1);
    const [weight] = await exec
      .select({ weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.localDate))
      .limit(1);
    return {
      body: body ?? null,
      goal: goal ?? null,
      weightKg: weight?.weightKg ?? null,
    };
  }
}
