import { sql } from 'drizzle-orm';
import type { Executor } from './executor';

export async function lockXact(
  tx: Pick<Executor, 'execute'>,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}
